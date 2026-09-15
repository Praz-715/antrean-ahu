import { prisma } from '../utils/prisma'
import { auth } from '../utils/auth'
import { newId } from '../utils/id'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { invalidateAuthContext } from '../utils/context'

export const userService = {
  async list(organizationId: string, params: { search?: string } = {}) {
    const users = await prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search } },
                { email: { contains: params.search } },
                { username: { contains: params.search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: { select: { role: { select: { id: true, key: true, name: true } } } },
        assignment: {
          select: {
            id: true,
            counter: {
              select: {
                id: true,
                code: true,
                name: true,
                event: { select: { id: true, name: true } },
                services: {
                  orderBy: { displayOrder: 'asc' },
                  select: { queueType: { select: { id: true, code: true, name: true, color: true } } },
                },
              },
            },
          },
        },
      },
    })

    return users.map(u => ({
      ...u,
      roles: u.userRoles.map(r => r.role),
      userRoles: undefined,
      /**
       * Satu operator satu tempat duduk (§28) — jadi ini objek, bukan daftar.
       * Layanannya diturunkan dari loket, bukan disimpan per pengguna.
       */
      placement: u.assignment
        ? {
            id: u.assignment.id,
            counter: { id: u.assignment.counter.id, code: u.assignment.counter.code, name: u.assignment.counter.name },
            event: u.assignment.counter.event,
            services: u.assignment.counter.services.map(s => s.queueType),
          }
        : null,
      assignment: undefined,
    }))
  },

  async roles(organizationId: string) {
    return prisma.role.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      orderBy: { key: 'asc' },
      select: { id: true, key: true, name: true, isSystem: true },
    })
  },

  /**
   * Buat pengguna baru. Password di-hash oleh Better Auth (bukan kode kita sendiri),
   * lalu kolom khusus ANTREAN dilengkapi setelahnya.
   */
  async create(organizationId: string, input: {
    name: string
    email: string
    password: string
    username?: string | null
    phone?: string | null
    roleId: string
  }) {
    const existing = await prisma.user.findFirst({ where: { email: input.email } })
    if (existing) throw errors.conflict(ERROR_CODES.CONFLICT, 'Email sudah terdaftar')

    const role = await prisma.role.findFirst({
      where: { id: input.roleId, OR: [{ organizationId }, { organizationId: null }] },
      select: { id: true },
    })
    if (!role) throw errors.notFound('Role tidak ditemukan')

    await auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.name },
    })

    const user = await prisma.user.findFirst({ where: { email: input.email } })
    if (!user) throw errors.badRequest(ERROR_CODES.INTERNAL_ERROR, 'Gagal membuat pengguna')

    await prisma.user.update({
      where: { id: user.id },
      data: {
        organizationId,
        username: input.username || null,
        phone: input.phone || null,
        emailVerified: true,
      },
    })
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })

    return this.getById(organizationId, user.id)
  },

  async getById(organizationId: string, id: string) {
    const user = await prisma.user.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: { select: { role: { select: { id: true, key: true, name: true } } } },
      },
    })
    if (!user) throw errors.notFound('Pengguna tidak ditemukan')
    return { ...user, roles: user.userRoles.map(r => r.role), userRoles: undefined }
  },

  async update(organizationId: string, id: string, input: {
    name?: string
    username?: string | null
    phone?: string | null
    isActive?: boolean
    roleId?: string
  }) {
    await this.getById(organizationId, id)

    await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.username !== undefined ? { username: input.username || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })

    if (input.roleId) {
      const role = await prisma.role.findFirst({
        where: { id: input.roleId, OR: [{ organizationId }, { organizationId: null }] },
        select: { id: true },
      })
      if (!role) throw errors.notFound('Role tidak ditemukan')
      await prisma.userRole.deleteMany({ where: { userId: id } })
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } })
    }

    invalidateAuthContext(id)
    return this.getById(organizationId, id)
  },

  /** Soft delete + cabut sesi aktif, supaya akun langsung tidak bisa dipakai. */
  async softDelete(organizationId: string, id: string, actorId: string) {
    if (id === actorId) throw errors.badRequest(ERROR_CODES.CONFLICT, 'Anda tidak dapat menghapus akun sendiri')

    const user = await this.getById(organizationId, id)
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
    ])
    invalidateAuthContext(id)
    return user
  },

  async resetPassword(organizationId: string, id: string, newPassword: string) {
    const user = await this.getById(organizationId, id)
    const ctx = await auth.$context
    const hash = await ctx.password.hash(newPassword)

    const account = await prisma.account.findFirst({ where: { userId: id, providerId: 'credential' } })
    if (!account) throw errors.notFound('Akun kredensial tidak ditemukan')

    await prisma.account.update({ where: { id: account.id }, data: { password: hash } })
    await prisma.session.deleteMany({ where: { userId: id } })
    invalidateAuthContext(id)

    return user
  },
}

/**
 * Penempatan operator (§12, §28).
 *
 * Operator DUDUK di satu loket; layanan yang ia tangani diturunkan dari loket itu
 * (`counter_services`). Karena `operator_assignments.user_id` unique dan loket
 * dimiliki satu event, aturan "satu operator satu event" dijamin database — bukan
 * lagi pemeriksaan di service yang bisa terlewat.
 */
export const assignmentService = {
  async list(organizationId: string, eventId?: string) {
    const rows = await prisma.operatorAssignment.findMany({
      where: {
        counter: {
          event: { organizationId, deletedAt: null },
          ...(eventId ? { eventId } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } },
        counter: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            event: { select: { id: true, name: true } },
            services: {
              orderBy: { displayOrder: 'asc' },
              select: { queueType: { select: { id: true, code: true, name: true, color: true } } },
            },
          },
        },
      },
    })

    return rows.map(row => ({
      id: row.id,
      createdAt: row.createdAt,
      user: row.user,
      counter: {
        id: row.counter.id,
        code: row.counter.code,
        name: row.counter.name,
        isActive: row.counter.isActive,
      },
      event: row.counter.event,
      /** Layanan yang ia tangani — milik loket, bukan milik penempatan. */
      services: row.counter.services.map(s => s.queueType),
    }))
  },

  /**
   * Calon operator untuk satu event beserta keterangan tempat duduknya sekarang.
   *
   * Dipakai halaman penugasan supaya admin tahu SEBELUM menyimpan — menolak setelah
   * tombol simpan ditekan memaksa admin menebak siapa yang masih bebas.
   */
  async candidates(organizationId: string, eventId: string) {
    const users = await prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        assignment: {
          select: {
            counter: {
              select: { id: true, code: true, name: true, eventId: true, event: { select: { id: true, name: true, status: true } } },
            },
          },
        },
      },
    })

    return users.map((user) => {
      const seat = user.assignment?.counter ?? null
      const here = seat?.eventId === eventId
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        /** Loket tempat ia duduk sekarang, di event mana pun. */
        seatedAt: seat ? { counter: { id: seat.id, code: seat.code, name: seat.name }, event: seat.event } : null,
        /** Sudah duduk di loket pada event yang sedang dibuka? */
        seatedHere: here,
        /** Terisi bila ia duduk di loket event LAIN (§28). */
        assignedEvent: seat && !here ? seat.event : null,
      }
    })
  },

  /**
   * Tempatkan operator di sebuah loket.
   *
   * Karena satu operator hanya boleh punya satu tempat duduk, memindahkannya berarti
   * mengganti barisnya. Pemindahan harus diminta eksplisit lewat `moveFromOtherCounter`
   * supaya penempatan lama tidak hilang tanpa disadari admin.
   */
  async place(organizationId: string, input: {
    userId: string
    counterId: string
    moveFromOtherCounter?: boolean
  }) {
    const [user, counter] = await Promise.all([
      prisma.user.findFirst({ where: { id: input.userId, organizationId, deletedAt: null }, select: { id: true } }),
      prisma.counter.findFirst({
        where: { id: input.counterId, event: { organizationId, deletedAt: null } },
        select: {
          id: true,
          name: true,
          event: { select: { id: true, name: true } },
          _count: { select: { services: true } },
        },
      }),
    ])
    if (!user) throw errors.notFound('Pengguna tidak ditemukan')
    if (!counter) throw errors.notFound('Loket tidak ditemukan')

    /**
     * Loket tanpa layanan tidak bisa dipakai bekerja: papan operatornya kosong dan
     * tombol panggil tidak punya sumber antrean. Lebih baik ditolak sekarang, dengan
     * keterangan, daripada operator kebingungan di depan layar.
     */
    if (counter._count.services === 0) {
      throw errors.conflict(
        ERROR_CODES.COUNTER_HAS_NO_SERVICE,
        `Loket "${counter.name}" belum melayani jenis antrean apa pun. Atur layanannya lebih dulu di halaman Loket.`,
      )
    }

    const existing = await prisma.operatorAssignment.findUnique({
      where: { userId: input.userId },
      include: {
        counter: { select: { id: true, name: true, event: { select: { id: true, name: true } } } },
      },
    })

    if (existing && existing.counterId !== input.counterId) {
      const from = existing.counter
      if (!input.moveFromOtherCounter) {
        const sameEvent = from.event.id === counter.event.id
        throw errors.conflict(
          ERROR_CODES.OPERATOR_ALREADY_SEATED,
          sameEvent
            ? `Operator ini sudah duduk di loket "${from.name}". Pilih "pindahkan" bila ingin memindahkannya.`
            : `Operator ini sudah duduk di loket "${from.name}" pada event "${from.event.name}". Satu operator hanya melayani satu event — pilih "pindahkan" bila memang ingin dipindahkan.`,
        )
      }

      // Jangan mencabut operator yang sedang memegang antrean di loket lamanya.
      const serving = await prisma.queue.count({
        where: { operatorId: input.userId, status: { in: ['CALLED', 'SERVING'] }, deletedAt: null },
      })
      if (serving > 0) {
        throw errors.conflict(
          ERROR_CODES.CONFLICT,
          `Operator masih melayani ${serving} antrean di loket "${from.name}". Selesaikan dahulu sebelum dipindahkan.`,
        )
      }
    }

    invalidateAuthContext(input.userId)

    const saved = await prisma.operatorAssignment.upsert({
      where: { userId: input.userId },
      update: { counterId: input.counterId },
      create: { id: newId(), userId: input.userId, counterId: input.counterId },
      include: {
        user: { select: { id: true, name: true } },
        counter: {
          select: {
            id: true,
            code: true,
            name: true,
            event: { select: { id: true, name: true } },
            services: {
              orderBy: { displayOrder: 'asc' },
              select: { queueType: { select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
    })

    return {
      id: saved.id,
      user: saved.user,
      counter: { id: saved.counter.id, code: saved.counter.code, name: saved.counter.name },
      event: saved.counter.event,
      services: saved.counter.services.map(s => s.queueType),
      movedFrom: existing && existing.counterId !== input.counterId ? existing.counter.name : null,
    }
  },

  /** Cabut penempatan operator dari loketnya. */
  async remove(organizationId: string, id: string) {
    const assignment = await prisma.operatorAssignment.findFirst({
      where: { id, counter: { event: { organizationId, deletedAt: null } } },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true } },
        counter: { select: { id: true, name: true } },
      },
    })
    if (!assignment) throw errors.notFound('Penempatan tidak ditemukan')

    // Operator yang sedang memegang antrean tidak boleh kehilangan loketnya.
    const active = await prisma.queue.count({
      where: { operatorId: assignment.userId, status: { in: ['CALLED', 'SERVING'] }, deletedAt: null },
    })
    if (active > 0) {
      throw errors.conflict(ERROR_CODES.CONFLICT, `Operator sedang melayani ${active} antrean. Selesaikan dahulu.`)
    }

    await prisma.operatorAssignment.delete({ where: { id } })
    invalidateAuthContext(assignment.userId)
    return assignment
  },
}
