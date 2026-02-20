import { Niivue } from '@niivue/niivue'

// This function computes the display names for each Niivue instance in the array
// It handles duplicate names by using overlay or layer names of the last item
export function getNames(nvArray: Niivue[]) {
  // Get base names (first volume or mesh)
  const baseNames = nvArray.map((item) => {
    if (item.volumes.length > 0) {
      return decodeURIComponent(item.volumes[0].name)
    }
    if (item.meshes.length > 0) {
      return decodeURIComponent(item.meshes[0].name)
    }
    if ((item as any).uri) {
      return decodeURIComponent((item as any).uri)
    }
    return ''
  })

  // Check for duplicates
  const nameCount = new Map<string, number>()
  baseNames.forEach((name) => {
    nameCount.set(name, (nameCount.get(name) || 0) + 1)
  })

  // Use last overlay only for items with duplicate base names
  return nvArray.map((item, idx) => {
    const baseName = baseNames[idx]
    const hasDuplicate = nameCount.get(baseName)! > 1

    if (!hasDuplicate) {
      return baseName
    }

    // For volumes with duplicates: use last overlay if available
    if (item.volumes.length > 1) {
      return decodeURIComponent(item.volumes[item.volumes.length - 1].name)
    }
    if (item.volumes.length > 0) {
      return baseName
    }

    // For meshes with duplicates: use last layer if available
    if (item.meshes.length > 0) {
      const mesh = item.meshes[0]
      if (mesh.layers && mesh.layers.length > 0) {
        const lastLayer = mesh.layers[mesh.layers.length - 1]
        if (lastLayer.name) {
          return decodeURIComponent(lastLayer.name)
        }
      }
      return baseName
    }

    return ''
  })
}

// This function finds common patterns in the names and only returns the parts of the names that are different
export function differenceInNames(names: string[], rec = true) {
  if (names.length === 0) {
    return []
  }
  const minLen = Math.min(...names.map((name) => name.length))
  let startCommon = minLen
  outer: while (startCommon > 0) {
    const chars = names[0].slice(0, startCommon)
    for (let i = 1; i < names.length; i++) {
      if (names[i].slice(0, startCommon) !== chars) {
        startCommon -= 1
        continue outer
      }
    }
    break
  }
  // if startCommon points to a number then include all preceding numbers including "." as well
  while (
    startCommon > 0 &&
    (names[0].slice(startCommon - 1, startCommon) === '.' ||
      (names[0].slice(startCommon - 1, startCommon) >= '0' &&
        names[0].slice(startCommon - 1, startCommon) <= '9'))
  ) {
    startCommon -= 1
  }
  // if startCommon points to a letter then include all preceding letters as well
  while (
    startCommon > 0 &&
    names[0].slice(startCommon - 1, startCommon).toLowerCase() >= 'a' &&
    names[0].slice(startCommon - 1, startCommon).toLowerCase() <= 'z'
  ) {
    startCommon -= 1
  }

  let endCommon = minLen
  outer: while (endCommon > 0) {
    const chars = names[0].slice(-endCommon)
    for (let i = 1; i < names.length; i++) {
      if (names[i].slice(-endCommon) !== chars) {
        endCommon -= 1
        continue outer
      }
    }
    break
  }
  // if endCommon points to a number then include all following numbers as well
  while (
    endCommon > 0 &&
    names[0].slice(-endCommon, names[0].length - endCommon + 1) >= '0' &&
    names[0].slice(-endCommon, names[0].length - endCommon + 1) <= '9'
  ) {
    endCommon -= 1
  }
  // if endCommon points to a letter then include all following letters as well
  while (
    endCommon > 0 &&
    names[0].slice(-endCommon, names[0].length - endCommon + 1) >= 'a' &&
    names[0].slice(-endCommon, names[0].length - endCommon + 1) <= 'z'
  ) {
    endCommon -= 1
  }

  const diffNames = names.map((name) => name.slice(startCommon, name.length - endCommon))

  // If length is greater than display length, then split by folder and diff again for first folder and filename and join
  if (rec) {
    const folders = diffNames.map((name) => name.split('/').slice(0, -1).join('/'))
    const diffFolders = differenceInNames(folders, false)
    const filenames = diffNames.map((name) => name.split('/').slice(-1)[0])
    const diffFilenames = differenceInNames(filenames, false)
    diffNames.forEach((_, i) => {
      let separator = ' - '
      if (!diffFolders[i] || !diffFilenames[i]) {
        separator = ''
      }
      diffNames[i] = diffFolders[i] + separator + diffFilenames[i]
    })
  }
  return diffNames
}

export function isImageType(item: string) {
  return [
    '.nii',
    '.nii.gz',
    '.dcm',
    '.mha',
    '.mhd',
    '.nhdr',
    '.nrrd',
    '.mgh',
    '.mgz',
    '.npy',
    '.npz',
    '.v',
    '.v16',
    '.vmr',
    '.mnc',
    '.mnc.gz',
  ].find((fileType) => item.endsWith(fileType))
}

export function getMetadataString(nv: Niivue) {
  const meta = nv?.volumes?.[0]?.getImageMetadata()
  if (!meta || !meta.nx) {
    return ''
  }
  const matrixString = 'matrix size: ' + meta.nx + ' x ' + meta.ny + ' x ' + meta.nz
  const voxelString =
    'voxelsize: ' +
    meta.dx.toPrecision(2) +
    ' x ' +
    meta.dy.toPrecision(2) +
    ' x ' +
    meta.dz.toPrecision(2)
  const timeString = meta.nt > 1 ? ', timepoints: ' + meta.nt : ''
  return matrixString + ', ' + voxelString + timeString
}

export function getNumberOfPoints(nv: Niivue) {
  const mesh = nv?.meshes?.[0]
  const matrixString = 'Number of Points: ' + mesh.pts.length / 3
  return matrixString
}

export type MetadataOperator = '>' | '<' | '>=' | '<=' | '=' | 'contains'

export interface MetadataCondition {
  field: string
  operator: MetadataOperator
  value: string | number
}

/**
 * Parse a simple SQL-like metadata query string into conditions.
 * Supports: "field > value", "field contains 'value'", conditions joined by AND.
 * Example: "nx > 100 AND name contains 'mni'"
 */
export function parseMetadataQuery(query: string): MetadataCondition[] {
  const conditions: MetadataCondition[] = []
  if (!query.trim()) return conditions

  const parts = query.split(/\bAND\b/i)
  for (const part of parts) {
    const trimmed = part.trim()
    const containsMatch = trimmed.match(/^(\w+)\s+contains\s+'([^']*)'$/i)
    if (containsMatch) {
      conditions.push({ field: containsMatch[1], operator: 'contains', value: containsMatch[2] })
      continue
    }
    const numMatch = trimmed.match(/^(\w+)\s*(>=|<=|>|<|=)\s*(-?\d+\.?\d*)$/)
    if (numMatch) {
      conditions.push({
        field: numMatch[1],
        operator: numMatch[2] as MetadataOperator,
        value: parseFloat(numMatch[3]),
      })
    }
  }
  return conditions
}

/**
 * Evaluate whether a NiiVue instance matches a metadata query string.
 * Returns true if no conditions are specified or all conditions match.
 */
export function evaluateMetadataQuery(nv: Niivue, query: string): boolean {
  if (!query.trim()) return true
  const conditions = parseMetadataQuery(query)
  // When no conditions can be parsed from a non-empty query (incomplete or malformed),
  // return true so the volume is not silently hidden while the user is still typing.
  if (conditions.length === 0) return true

  const meta: Record<string, any> =
    (nv?.volumes?.length ?? 0) > 0 ? (nv.volumes[0].getImageMetadata() ?? {}) : {}
  const name: string =
    decodeURIComponent(nv?.volumes?.[0]?.name ?? nv?.meshes?.[0]?.name ?? (nv as any)?.uri ?? '')

  return conditions.every((cond) => {
    const field = cond.field.toLowerCase()
    let fieldValue: any
    if (field === 'name') {
      fieldValue = name
    } else {
      fieldValue = meta[cond.field] ?? meta[field]
    }
    if (fieldValue === undefined || fieldValue === null) return false

    switch (cond.operator) {
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(cond.value).toLowerCase())
      case '>':
        return Number(fieldValue) > Number(cond.value)
      case '<':
        return Number(fieldValue) < Number(cond.value)
      case '>=':
        return Number(fieldValue) >= Number(cond.value)
      case '<=':
        return Number(fieldValue) <= Number(cond.value)
      case '=':
        return String(fieldValue) === String(cond.value)
      default:
        return false
    }
  })
}
