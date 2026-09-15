<script setup lang="ts">
import { ticketDate, type TicketPayload } from '#shared/utils/ticket'

/**
 * Tiket antrean yang siap dicetak (§46).
 *
 * Di layar komponen ini tidak terlihat; ia hanya muncul saat dicetak, dan saat itu
 * seluruh isi halaman lain disembunyikan. Lebarnya dikunci 58 mm supaya keluarannya
 * cocok untuk printer struk yang paling umum dipakai di loket.
 */
defineProps<{ ticket: TicketPayload }>()
</script>

<template>
  <div class="antrean-ticket">
    <div class="antrean-ticket__paper">
      <p class="antrean-ticket__org">
        {{ ticket.organizationName }}
      </p>
      <p v-if="ticket.eventName" class="antrean-ticket__event">
        {{ ticket.eventName }}
      </p>

      <p class="antrean-ticket__number">
        {{ ticket.queueNumber }}
      </p>

      <p class="antrean-ticket__service">
        {{ ticket.queueTypeName }}
      </p>
      <p v-if="ticket.counterName" class="antrean-ticket__service">
        {{ ticket.counterName }}
      </p>

      <p class="antrean-ticket__date">
        {{ ticketDate(ticket.serviceDate) }} · {{ ticket.issuedAt }}
      </p>

      <p class="antrean-ticket__note">
        Silakan menunggu
      </p>
      <p v-if="ticket.nowServing" class="antrean-ticket__note">
        Saat ini: {{ ticket.nowServing }}
      </p>

      <p v-if="ticket.visitorName" class="antrean-ticket__visitor">
        {{ ticket.visitorName }}
      </p>
      <p v-if="ticket.trackUrl" class="antrean-ticket__url">
        {{ ticket.trackUrl }}
      </p>
      <p v-if="ticket.footerText" class="antrean-ticket__footer">
        {{ ticket.footerText }}
      </p>
    </div>
  </div>
</template>

<style>
.antrean-ticket {
  display: none;
}

@media print {
  /* Sembunyikan seluruh halaman, lalu tampilkan hanya tiketnya. */
  body * {
    visibility: hidden;
  }

  .antrean-ticket,
  .antrean-ticket * {
    visibility: visible;
  }

  .antrean-ticket {
    display: block;
    position: absolute;
    inset: 0 auto auto 0;
    width: 58mm;
  }

  .antrean-ticket__paper {
    width: 58mm;
    padding: 4mm 2mm;
    text-align: center;
    font-family: ui-monospace, "Courier New", monospace;
    color: #000;
  }

  .antrean-ticket__org {
    font-size: 11pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .antrean-ticket__event {
    font-size: 8pt;
    text-transform: uppercase;
  }

  .antrean-ticket__number {
    margin: 4mm 0;
    font-size: 34pt;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.05em;
  }

  .antrean-ticket__service {
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
  }

  .antrean-ticket__date {
    margin-top: 3mm;
    font-size: 9pt;
  }

  .antrean-ticket__note {
    margin-top: 2mm;
    font-size: 9pt;
  }

  .antrean-ticket__visitor {
    margin-top: 3mm;
    font-size: 9pt;
    font-weight: 700;
  }

  .antrean-ticket__url {
    margin-top: 3mm;
    font-size: 7pt;
    word-break: break-all;
  }

  .antrean-ticket__footer {
    margin-top: 3mm;
    font-size: 8pt;
  }

  @page {
    size: 58mm auto;
    margin: 0;
  }
}
</style>
