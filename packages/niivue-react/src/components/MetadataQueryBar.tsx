import { Signal, computed, useSignal } from '@preact/signals'
import { ExtendedNiivue } from '../events'
import { evaluateMetadataQuery } from '../utility'

interface MetadataQueryBarProps {
  nvArray: Signal<ExtendedNiivue[]>
  visible: Signal<boolean>
}

/**
 * MetadataQueryBar – filter loaded volumes with a SQL-like query.
 *
 * Supported syntax (conditions joined by AND):
 *   name contains 'mni'
 *   nx > 100
 *   ny >= 64 AND nz <= 256
 *   nt > 1
 *
 * Matching volumes are highlighted; non-matching volumes are dimmed.
 * Clearing the query restores all volumes to full opacity in the list.
 */
export const MetadataQueryBar = ({ nvArray, visible }: MetadataQueryBarProps) => {
  // useSignal is a Preact hook — must be called unconditionally before any early returns
  const query = useSignal('')

  if (!visible.value) return null

  // Combine error and results into one computation to avoid side effects inside computed
  const queryResult = computed(() => {
    const q = query.value.trim()
    if (!q) return { error: '', results: nvArray.value.map(() => true) }
    try {
      return { error: '', results: nvArray.value.map((nv) => evaluateMetadataQuery(nv, q)) }
    } catch {
      return { error: 'Invalid query', results: nvArray.value.map(() => false) }
    }
  })

  const matchCount = computed(() => queryResult.value.results.filter(Boolean).length)

  const getName = (nv: ExtendedNiivue) =>
    decodeURIComponent(
      nv.volumes[0]?.name ?? nv.meshes[0]?.name ?? (nv as any).uri ?? 'unnamed',
    )

  return (
    <div className="bg-gray-600 rounded-md p-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold flex-shrink-0">Query:</span>
        <input
          className="bg-gray-700 border border-gray-400 rounded text-xs flex-1 px-1 h-6"
          type="text"
          placeholder="e.g. nx > 64 AND name contains 'mni'"
          value={query.value}
          onInput={(e) => (query.value = (e.target as HTMLInputElement).value)}
        />
        {query.value && (
          <button
            className="bg-gray-700 border border-gray-400 rounded text-xs px-1 h-6 hover:bg-gray-600"
            onClick={() => (query.value = '')}
            title="Clear query"
          >
            ×
          </button>
        )}
        <button
          className="bg-gray-700 border border-gray-400 rounded text-xs px-1 h-6 hover:bg-gray-600"
          onClick={() => (visible.value = false)}
          title="Close"
        >
          Close
        </button>
      </div>
      {queryResult.value.error && (
        <p className="text-xs text-red-400">{queryResult.value.error}</p>
      )}
      {query.value.trim() && !queryResult.value.error && (
        <p className="text-xs text-gray-300">
          {matchCount.value} / {nvArray.value.length} {matchCount.value === 1 ? 'match' : 'matches'}
        </p>
      )}
      {query.value.trim() && nvArray.value.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {nvArray.value.map((nv, i) => (
            <li
              key={i}
              className={`truncate px-1 rounded ${
                queryResult.value.results[i] ? 'text-green-300' : 'text-gray-500'
              }`}
              title={getName(nv)}
            >
              {queryResult.value.results[i] ? '✓' : '✗'} {getName(nv)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
