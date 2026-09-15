<script setup lang="ts">
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

/**
 * Pembungkus ECharts.
 *
 * Hanya modul yang dipakai yang didaftarkan, supaya bundel tidak membawa seluruh
 * pustaka. Komponen ini `.client.vue` karena ECharts butuh DOM sungguhan.
 */
echarts.use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  CanvasRenderer,
])

const props = defineProps<{
  option: EChartsOption
  height?: number
}>()

const el = ref<HTMLElement | null>(null)
const colorMode = useColorMode()
let chart: echarts.ECharts | undefined
let observer: ResizeObserver | undefined

function render() {
  if (!el.value) return
  chart?.dispose()
  chart = echarts.init(el.value, colorMode.value === 'dark' ? 'dark' : undefined, { renderer: 'canvas' })
  chart.setOption({
    backgroundColor: 'transparent',
    ...props.option,
  })
}

/**
 * Beberapa instance komponen ini dipasang dalam satu render; template ref-nya
 * belum tentu sudah terikat saat `onMounted` berjalan. Tunggu sampai elemennya
 * benar-benar ada sebelum ECharts diinisialisasi — kalau tidak, sebagian chart
 * diam-diam tidak pernah tergambar.
 */
async function waitForElement(maxTicks = 10) {
  for (let i = 0; i < maxTicks; i++) {
    if (el.value) return true
    await nextTick()
  }
  return !!el.value
}

onMounted(async () => {
  if (!(await waitForElement())) return

  render()
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el.value!)
})

watch(() => props.option, () => {
  if (chart) chart.setOption({ backgroundColor: 'transparent', ...props.option }, true)
}, { deep: true })

// tema gelap/terang butuh instance baru; ECharts tidak bisa ganti tema di tempat
watch(() => colorMode.value, () => render())

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div ref="el" :style="{ height: `${height ?? 280}px`, width: '100%' }" />
</template>
