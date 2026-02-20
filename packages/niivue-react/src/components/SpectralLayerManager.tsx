import { Signal, computed } from '@preact/signals'
import { ExtendedNiivue } from '../events'

interface SpectralLayerManagerProps {
  nvArray: Signal<ExtendedNiivue[]>
  nvArraySelected: Signal<ExtendedNiivue[]>
  visible: Signal<boolean>
}

/**
 * SpectralLayerManager – toggle visibility and set false-color per layer.
 *
 * Shows every volume overlay or mesh layer loaded in the first selected viewer.
 * Each row provides:
 *   • Eye button  – toggle opacity between 0 (hidden) and 1 (visible)
 *   • Name label  – filename or "Layer N"
 *   • Colormap select – false-color the layer using any built-in colormap
 */
export const SpectralLayerManager = ({
  nvArray,
  nvArraySelected,
  visible,
}: SpectralLayerManagerProps) => {
  if (!visible.value) return null

  const nv = computed(() => nvArraySelected.value[0])
  if (!nv.value) return null

  const isVolume = computed(() => (nv.value?.volumes?.length ?? 0) > 0)

  const layers = computed(() => {
    const instance = nv.value
    if (!instance) return []
    if (isVolume.value) {
      return instance.volumes.map((vol: any, idx: number) => ({
        idx,
        name: decodeURIComponent(vol.name || `Layer ${idx + 1}`),
        colormap: (vol.colormap as string) || 'gray',
        opacity: (vol.opacity as number) ?? 1,
      }))
    }
    if (instance.meshes.length > 0) {
      return instance.meshes[0].layers.map((layer: any, idx: number) => ({
        idx,
        name: decodeURIComponent(layer.name || `Layer ${idx + 1}`),
        colormap: (layer.colormap as string) || 'gray',
        opacity: (layer.opacity as number) ?? 1,
      }))
    }
    return []
  })

  const colormaps = computed((): string[] => {
    const instance = nv.value
    if (instance?.volumes?.length > 0) {
      return instance.colormaps() as string[]
    }
    return ['ge_color', 'gray', 'hot', 'hsv', 'redyell', 'warm']
  })

  const toggleVisibility = (idx: number, currentOpacity: number) => {
    const instance = nv.value
    if (!instance) return
    const newOpacity = currentOpacity > 0 ? 0 : 1
    if (isVolume.value) {
      instance.setOpacity(idx, newOpacity)
    } else {
      instance.setMeshLayerProperty(
        instance.meshes[0].id as any,
        idx,
        'opacity',
        newOpacity as any,
      )
    }
    instance.updateGLVolume()
    nvArray.value = [...nvArray.value]
  }

  const changeColormap = (idx: number, colormap: string) => {
    const instance = nv.value
    if (!instance) return
    if (isVolume.value) {
      const vol = instance.volumes[idx]
      if (vol) {
        vol.colormap = colormap
        vol.colormapNegative = ''
      }
    } else {
      instance.setMeshLayerProperty(
        instance.meshes[0].id as any,
        idx,
        'colormap',
        colormap as any,
      )
    }
    instance.updateGLVolume()
    nvArray.value = [...nvArray.value]
  }

  return (
    <div className="absolute left-8 top-8 bg-gray-500 rounded-md z-50 p-2 min-w-72">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-sm">Spectral Layer Manager</span>
        <button
          className="bg-gray-600 border border-gray-400 rounded px-2 hover:bg-gray-700"
          onClick={() => (visible.value = false)}
        >
          ×
        </button>
      </div>
      {layers.value.length === 0 && (
        <p className="text-xs text-gray-300">No layers loaded</p>
      )}
      {layers.value.map((layer) => (
        <div key={layer.idx} className="flex items-center gap-2 mb-1">
          <button
            className={`w-7 h-6 rounded border border-gray-400 text-xs flex-shrink-0 ${
              layer.opacity > 0 ? 'bg-green-700 hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            onClick={() => toggleVisibility(layer.idx, layer.opacity)}
            title={layer.opacity > 0 ? 'Hide layer' : 'Show layer'}
          >
            {layer.opacity > 0 ? '👁' : '○'}
          </button>
          <span className="text-xs flex-1 truncate min-w-0" title={layer.name}>
            {layer.name}
          </span>
          <select
            className="bg-gray-600 text-xs border border-gray-400 rounded w-24 flex-shrink-0"
            value={layer.colormap}
            onChange={(e) => changeColormap(layer.idx, (e.target as HTMLSelectElement).value)}
          >
            {colormaps.value.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
