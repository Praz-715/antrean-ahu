import { describe, expect, it } from 'vitest'
import { applyMappings, applyTransform, readPath } from '../../server/services/datasource.service'

const RESPONSE = {
  status: 'ok',
  data: {
    patient: {
      name: 'siti aminah',
      gender: 'F',
      birthDate: '1990-04-17T00:00:00.000Z',
      phone: '+62 812-3456-7890',
      address: { city: 'Bengkulu' },
      visits: [{ id: 'V1' }, { id: 'V2' }],
      allergies: null,
    },
  },
}

describe('readPath', () => {
  it('membaca path bertitik', () => {
    expect(readPath(RESPONSE, 'data.patient.name')).toBe('siti aminah')
    expect(readPath(RESPONSE, 'data.patient.address.city')).toBe('Bengkulu')
  })

  it('membaca indeks array dalam dua notasi', () => {
    expect(readPath(RESPONSE, 'data.patient.visits[1].id')).toBe('V2')
    expect(readPath(RESPONSE, 'data.patient.visits.0.id')).toBe('V1')
  })

  it('mengembalikan undefined untuk path yang tidak ada, bukan melempar', () => {
    expect(readPath(RESPONSE, 'data.patient.tidak.ada')).toBeUndefined()
    expect(readPath(RESPONSE, 'data.patient.visits[9].id')).toBeUndefined()
    expect(readPath(null, 'apa.saja')).toBeUndefined()
  })
})

describe('applyTransform', () => {
  it('merapikan teks sesuai transform', () => {
    expect(applyTransform('  halo  ', 'trim')).toBe('halo')
    expect(applyTransform('halo', 'uppercase')).toBe('HALO')
    expect(applyTransform('HALO', 'lowercase')).toBe('halo')
    expect(applyTransform('siti aminah', 'capitalize')).toBe('Siti Aminah')
  })

  it('digits menyisakan angka saja — berguna untuk nomor HP', () => {
    expect(applyTransform('+62 812-3456-7890', 'digits')).toBe('6281234567890')
  })

  it('date menormalkan ke YYYY-MM-DD dan membiarkan teks yang bukan tanggal', () => {
    expect(applyTransform('1990-04-17T00:00:00.000Z', 'date')).toBe('1990-04-17')
    expect(applyTransform('bukan tanggal', 'date')).toBe('bukan tanggal')
  })

  it('nilai kosong tetap null', () => {
    expect(applyTransform(null, 'trim')).toBeNull()
    expect(applyTransform(undefined, 'none')).toBeNull()
  })
})

describe('applyMappings', () => {
  const mappings = [
    { sourcePath: 'patient.name', targetFieldKey: 'nama', transform: 'capitalize' },
    { sourcePath: 'patient.phone', targetFieldKey: 'no_hp', transform: 'digits' },
    { sourcePath: 'patient.birthDate', targetFieldKey: 'tgl_lahir', transform: 'date' },
    { sourcePath: 'patient.allergies', targetFieldKey: 'alergi', transform: null },
    { sourcePath: 'patient.tidak_ada', targetFieldKey: 'entah', transform: null },
  ]

  it('memetakan relatif terhadap path akar', () => {
    expect(applyMappings(RESPONSE, mappings, 'data')).toEqual({
      nama: 'Siti Aminah',
      no_hp: '6281234567890',
      tgl_lahir: '1990-04-17',
    })
  })

  it('field kosong dan path yang meleset tidak ikut terkirim', () => {
    const result = applyMappings(RESPONSE, mappings, 'data')
    expect(result).not.toHaveProperty('alergi')
    expect(result).not.toHaveProperty('entah')
  })

  it('tanpa path akar, pemetaan dibaca dari akar respons', () => {
    expect(applyMappings(RESPONSE, [{ sourcePath: 'status', targetFieldKey: 'st', transform: null }], null))
      .toEqual({ st: 'ok' })
  })
})
