import * as vscode from 'vscode'
import { SpecimenRegistry } from './registry'
import { WetLabTreeProvider } from './treeProvider'

/** Input schema for the list-specimens tool (no parameters needed) */
interface ListSpecimensInput {}

/** Input schema for get-provenance tool */
interface GetProvenanceInput {
  /** The name or partial URI of the specimen to look up */
  specimenName: string
}

/** Input schema for add-note tool */
interface AddNoteInput {
  /** The name or partial URI of the specimen */
  specimenName: string
  /** The note text to add */
  note: string
}

/** Input schema for register-specimen tool */
interface RegisterSpecimenInput {
  /** The file path or URI string of the file to register */
  filePath: string
}

function makeTextResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)])
}

/**
 * Tool: wetlab_listSpecimens
 * Lists all specimens currently in the Digital Wet Lab registry.
 */
export class ListSpecimensTool implements vscode.LanguageModelTool<ListSpecimensInput> {
  constructor(private readonly registry: SpecimenRegistry) {}

  invoke(
    _options: vscode.LanguageModelToolInvocationOptions<ListSpecimensInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.LanguageModelToolResult> {
    const specimens = this.registry.list()
    if (specimens.length === 0) {
      return makeTextResult('No specimens are registered in the Digital Wet Lab yet.')
    }

    const lines = ['Registered specimens in the Digital Wet Lab:', '']
    for (const s of specimens) {
      const registered = new Date(s.registeredAt).toLocaleString()
      const size = s.fileSizeBytes !== undefined ? ` (${(s.fileSizeBytes / 1024).toFixed(1)} KB)` : ''
      const tags = s.tags.length > 0 ? ` [${s.tags.join(', ')}]` : ''
      lines.push(`- ${s.name}${size}${tags} — registered ${registered}`)
      lines.push(`  URI: ${s.uri}`)
      if (s.sha256) {
        lines.push(`  SHA-256: ${s.sha256.slice(0, 16)}…`)
      }
      if (s.dimensions) {
        lines.push(`  Dimensions: ${s.dimensions}`)
      }
    }
    return makeTextResult(lines.join('\n'))
  }

  prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<ListSpecimensInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Listing registered wet lab specimens…' }
  }
}

/**
 * Tool: wetlab_getProvenance
 * Returns the full provenance chain for a given specimen.
 */
export class GetProvenanceTool implements vscode.LanguageModelTool<GetProvenanceInput> {
  constructor(private readonly registry: SpecimenRegistry) {}

  /**
   * Suggest specimen names that are similar to the given query.
   * This is used to provide more helpful error messages when no exact
   * substring match is found.
   */
  private suggestSpecimens(
    query: string,
    specimens: { name: string; uri: string }[],
  ): string[] {
    const normalized = query.toLowerCase().trim()
    if (!normalized) {
      return []
    }

    const scored = specimens.map((s) => {
      const label = s.name || s.uri
      const candidate = `${s.name} ${s.uri}`.toLowerCase()
      // Compare against a slice of the candidate to keep the distance
      // computation reasonably small while still meaningful.
      const sliceLength = Math.max(normalized.length, Math.min(candidate.length, normalized.length * 2))
      const candidateSlice = candidate.slice(0, sliceLength)
      const distance = this.levenshtein(normalized, candidateSlice)
      return { label, distance }
    })

    scored.sort((a, b) => a.distance - b.distance)

    const maxDistance = Math.max(3, Math.floor(normalized.length / 2))
    return scored
      .filter((s) => s.distance <= maxDistance)
      .slice(0, 5)
      .map((s) => s.label)
  }

  /**
   * Compute the Levenshtein distance between two strings.
   * This is a simple dynamic-programming implementation adequate for
   * short specimen-name queries.
   */
  private levenshtein(a: string, b: string): number {
    if (a === b) {
      return 0
    }
    if (a.length === 0) {
      return b.length
    }
    if (b.length === 0) {
      return a.length
    }

    const dp = new Array<number>(b.length + 1)
    for (let j = 0; j <= b.length; j++) {
      dp[j] = j
    }

    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0]
      dp[0] = i
      for (let j = 1; j <= b.length; j++) {
        const temp = dp[j]
        if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
          dp[j] = prev
        } else {
          dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1)
        }
        prev = temp
      }
    }

    return dp[b.length]
  }

  invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetProvenanceInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.LanguageModelToolResult> {
    const query = options.input.specimenName.toLowerCase()
    const specimens = this.registry.list()
    const matches = specimens.filter(
      (s) => s.name.toLowerCase().includes(query) || s.uri.toLowerCase().includes(query),
    )

    if (matches.length === 0) {
      const suggestions = this.suggestSpecimens(query, specimens)
      let message = `No specimen found matching "${options.input.specimenName}". Use the wetlab_listSpecimens tool to see all registered specimens.`
      if (suggestions.length > 0) {
        message += `\n\nDid you mean:\n${suggestions.map((s) => `- ${s}`).join('\n')}`
      }
      return makeTextResult(message)
    }

    if (matches.length > 1) {
      const header =
        `Multiple specimens match "${options.input.specimenName}". ` +
        'Please refine your query or use the wetlab_listSpecimens tool to see details.\n'
      const list = matches
        .map((s) => `- ${s.name} (${s.uri})`)
        .join('\n')
      return makeTextResult(`${header}\n${list}`)
    }

    const match = matches[0]
    const lines: string[] = [
      `📊 Provenance Chain: ${match.name}`,
      '─'.repeat(60),
      `URI:        ${match.uri}`,
      `Registered: ${new Date(match.registeredAt).toLocaleString()}`,
    ]
    if (match.fileSizeBytes !== undefined) {
      lines.push(`File size:  ${match.fileSizeBytes.toLocaleString()} bytes`)
    }
    if (match.sha256) {
      lines.push(`SHA-256:    ${match.sha256}`)
    }
    if (match.dimensions) {
      lines.push(`Dimensions: ${match.dimensions}`)
    }
    if (match.tags.length > 0) {
      lines.push(`Tags:       ${match.tags.join(', ')}`)
    }
    lines.push('─'.repeat(60), 'History:')
    match.provenance.forEach((p) => {
      const note = p.note ? ` — "${p.note}"` : ''
      lines.push(`  • [${new Date(p.timestamp).toLocaleString()}] ${p.action}${note}`)
    })

    return makeTextResult(lines.join('\n'))
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<GetProvenanceInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Fetching provenance for "${options.input.specimenName}"…`,
    }
  }
}

/**
 * Tool: wetlab_addNote
 * Adds a provenance note to a registered specimen.
 */
export class AddNoteTool implements vscode.LanguageModelTool<AddNoteInput> {
  constructor(
    private readonly registry: SpecimenRegistry,
    private readonly treeProvider: WetLabTreeProvider,
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AddNoteInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const query = options.input.specimenName.trim().toLowerCase()
    const specimens = this.registry.list()

    // Prefer exact (case-insensitive) matches on name or URI
    const exactMatches = specimens.filter((s) => {
      const name = s.name.toLowerCase()
      const uri = s.uri.toLowerCase()
      return name === query || uri === query
    })

    let match = null as (typeof specimens)[number] | null

    if (exactMatches.length === 1) {
      match = exactMatches[0]
    } else if (exactMatches.length > 1) {
      const candidates = exactMatches.map((s) => `- ${s.name} (${s.uri})`).join('\n')
      return makeTextResult(
        `Multiple specimens match "${options.input.specimenName}" exactly:\n\n${candidates}\n\n` +
          'Please specify a more precise specimen name or URI.',
      )
    } else {
      // Fallback to partial (substring) matches when there is no exact match
      const partialMatches = specimens.filter((s) => {
        const name = s.name.toLowerCase()
        const uri = s.uri.toLowerCase()
        return name.includes(query) || uri.includes(query)
      })

      if (partialMatches.length === 1) {
        match = partialMatches[0]
      } else if (partialMatches.length === 0) {
        return makeTextResult(
          `No specimen found matching "${options.input.specimenName}". Use the wetlab_listSpecimens tool to see all registered specimens.`,
        )
      } else {
        const candidates = partialMatches.map((s) => `- ${s.name} (${s.uri})`).join('\n')
        return makeTextResult(
          `Multiple specimens match "${options.input.specimenName}":\n\n${candidates}\n\n` +
            'Please specify a more precise specimen name or URI.',
        )
      }
    }

    try {
      const result = await this.registry.addNote(match.id, options.input.note)

      // If the registry reports failure explicitly (e.g., by returning false),
      // surface that to the user instead of claiming success.
      if (result === false) {
        return makeTextResult(
          `Failed to add note to specimen "${match.name}". The specimen may have been removed or is no longer available.`,
        )
      }

      this.treeProvider.refresh()
      return makeTextResult(
        `Note added to specimen "${match.name}": "${options.input.note}"`,
      )
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? ` ${error.message}`
          : ''
      return makeTextResult(
        `Failed to add note to specimen "${match.name}".${message}`,
      )
    }
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AddNoteInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Adding note to specimen "${options.input.specimenName}"…`,
      confirmationMessages: {
        title: 'Add Note to Specimen',
        message: new vscode.MarkdownString(
          `Add the following note to **${options.input.specimenName}**?\n\n> ${options.input.note}`,
        ),
      },
    }
  }
}

/**
 * Tool: wetlab_registerSpecimen
 * Registers a file as a digital specimen in the Wet Lab registry.
 */
export class RegisterSpecimenTool implements vscode.LanguageModelTool<RegisterSpecimenInput> {
  constructor(
    private readonly registry: SpecimenRegistry,
    private readonly treeProvider: WetLabTreeProvider,
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RegisterSpecimenInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    let uri: vscode.Uri
    try {
      uri = options.input.filePath.startsWith('file:')
        ? vscode.Uri.parse(options.input.filePath)
        : vscode.Uri.file(options.input.filePath)
    } catch {
      return makeTextResult(`Invalid file path: "${options.input.filePath}"`)
    }

    try {
      const entry = await this.registry.register(uri)
      this.treeProvider.refresh()
      const checksum = entry.sha256 ? ` · SHA-256: ${entry.sha256.slice(0, 8)}…` : ''
      return makeTextResult(`Specimen registered: ${entry.name}${checksum}\nURI: ${entry.uri}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return makeTextResult(`Failed to register specimen: ${msg}`)
    }
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RegisterSpecimenInput>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Registering specimen "${options.input.filePath}"…`,
      confirmationMessages: {
        title: 'Register Specimen',
        message: new vscode.MarkdownString(
          `Register **${options.input.filePath}** as a digital specimen in the Wet Lab registry?`,
        ),
      },
    }
  }
}

/**
 * Register all Wet Lab LM tools with the VS Code language model service.
 * Returns a Disposable that unregisters all tools.
 */
export function registerWetLabTools(
  registry: SpecimenRegistry,
  treeProvider: WetLabTreeProvider,
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [
    vscode.lm.registerTool('wetlab_listSpecimens', new ListSpecimensTool(registry)),
    vscode.lm.registerTool('wetlab_getProvenance', new GetProvenanceTool(registry)),
    vscode.lm.registerTool('wetlab_addNote', new AddNoteTool(registry, treeProvider)),
    vscode.lm.registerTool('wetlab_registerSpecimen', new RegisterSpecimenTool(registry, treeProvider)),
  ]
  return vscode.Disposable.from(...disposables)
}
