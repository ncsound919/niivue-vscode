import * as vscode from 'vscode'
import { SpecimenRegistry } from './registry'

/** Maximum number of specimens to include in the LLM context to avoid exceeding context window limits. */
const MAX_SPECIMENS_IN_CONTEXT = 20

const PARTICIPANT_ID = 'niivue.wetlab'

/**
 * Creates and registers the @wetlab chat participant.
 *
 * The participant responds to user queries about registered specimens,
 * provenance, and Digital Wet Lab operations. It uses the VS Code LM API
 * to generate intelligent, context-aware responses.
 *
 * @returns A Disposable that unregisters the participant when disposed.
 */
export function registerWetLabChatParticipant(
  registry: SpecimenRegistry,
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    response: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> => {
    const prompt = request.prompt.trim().toLowerCase()

    // Handle declared slash commands explicitly via request.command
    const isListCommand =
      request.command === 'list' ||
      prompt.includes('list') ||
      prompt.includes('show all') ||
      prompt.includes('what specimens')

    const isProvenanceCommand = request.command === 'provenance'

    // Show a helpful introduction when the user hasn't typed anything yet
    if (!isListCommand && !isProvenanceCommand && prompt === '') {
      response.markdown(
        '### Digital Wet Lab — Specimen Assistant\n\n' +
          'Ask me about registered specimens, provenance, or Digital Wet Lab operations.\n\n' +
          '- Use `/list` or type **"list specimens"** to see all registered specimens.\n' +
          '- Use `/provenance <name>` or ask about a specific specimen to get its provenance.\n' +
          '- Describe an operation or analysis you want to perform on a specimen.\n\n' +
          'To register a new specimen, right-click a medical-imaging file in the Explorer and choose ' +
          '**Wet Lab: Register as Specimen**, or run the `wetlab.registerSpecimen` command.',
      )
      return
    }

    // Fast-path: /list or plain list queries answered without an LLM round-trip
    if (isListCommand) {
      const specimens = registry.list()
      if (specimens.length === 0) {
        response.markdown(
          'No specimens are registered in the Digital Wet Lab yet.\n\n' +
            'To register one, right-click a medical-imaging file in the Explorer and choose ' +
            '**Wet Lab: Register as Specimen**, or run the `wetlab.registerSpecimen` command.',
        )
        return
      }

      response.markdown(`### Digital Wet Lab — Registered Specimens (${specimens.length})\n`)
      for (const s of specimens) {
        const registered = new Date(s.registeredAt).toLocaleString()
        const size =
          s.fileSizeBytes !== undefined ? ` · ${(s.fileSizeBytes / 1024).toFixed(1)} KB` : ''
        const tags = s.tags.length > 0 ? ` · tags: ${s.tags.join(', ')}` : ''
        response.markdown(`**${s.name}**${size}${tags}  \n`)
        response.markdown(`Registered: ${registered}  \n`)
        if (s.sha256) {
          response.markdown(`SHA-256: \`${s.sha256.slice(0, 16)}…\`  \n`)
        }
        response.markdown(`\n`)
      }
      return
    }

    // Fast-path: /provenance <name> answered without an LLM round-trip
    if (isProvenanceCommand) {
      const specimenQuery = request.prompt.trim()
      if (!specimenQuery) {
        response.markdown(
          '⚠️ Please provide a specimen name. Example: `/provenance brain.nii.gz`',
        )
        return
      }
      const queryLower = specimenQuery.toLowerCase()
      const allSpecimens = registry.list()
      const match =
        allSpecimens.find((s) => s.name.toLowerCase() === queryLower) ??
        allSpecimens.find(
          (s) =>
            s.name.toLowerCase().includes(queryLower) ||
            s.uri.toLowerCase().includes(queryLower),
        )
      if (!match) {
        response.markdown(
          `No specimen found matching **"${specimenQuery}"**. ` +
            'Use `/list` to see all registered specimens.',
        )
        return
      }
      const lines: string[] = [
        `### 📊 Provenance: ${match.name}`,
        `**URI:** \`${match.uri}\`  `,
        `**Registered:** ${new Date(match.registeredAt).toLocaleString()}  `,
      ]
      if (match.fileSizeBytes !== undefined) {
        lines.push(`**Size:** ${match.fileSizeBytes.toLocaleString()} bytes  `)
      }
      if (match.sha256) {
        lines.push(`**SHA-256:** \`${match.sha256}\`  `)
      }
      if (match.dimensions) {
        lines.push(`**Dimensions:** ${match.dimensions}  `)
      }
      if (match.tags.length > 0) {
        lines.push(`**Tags:** ${match.tags.join(', ')}  `)
      }
      lines.push('\n**History:**')
      match.provenance.forEach((p) => {
        const note = p.note ? ` — "${p.note}"` : ''
        lines.push(`- \`${new Date(p.timestamp).toLocaleString()}\` **${p.action}**${note}`)
      })
      response.markdown(lines.join('\n'))
      return
    }

    // Use the LM API to answer more complex queries with specimen context
    const config = vscode.workspace.getConfiguration('niivue.wetlab')
    const preferredModelFamily = config.get<string | undefined>('preferredModelFamily')

    let models: readonly vscode.LanguageModelChat[]
    if (preferredModelFamily) {
      models = await vscode.lm.selectChatModels({ family: preferredModelFamily })
      if (models.length === 0) {
        models = await vscode.lm.selectChatModels()
      }
    } else {
      models = await vscode.lm.selectChatModels()
    }

    const model = models[0]
    if (!model) {
      response.markdown(
        '⚠️ No language model is available. Please install GitHub Copilot or another LLM extension.',
      )
      return
    }

    // Build context from the registry, capped to avoid exceeding context window limits.
    // registry.list() returns specimens sorted newest-first, so the first MAX_SPECIMENS_IN_CONTEXT
    // entries are the most recently registered specimens.
    const allSpecimens = registry.list()
    const specimenSubset = allSpecimens.slice(0, MAX_SPECIMENS_IN_CONTEXT)
    const truncated = allSpecimens.length > MAX_SPECIMENS_IN_CONTEXT
    const registryContext =
      specimenSubset.length > 0
        ? specimenSubset
            .map((s) => {
              const parts: string[] = [`File: ${s.name}`, `URI: ${s.uri}`]
              if (s.sha256) {
                parts.push(`SHA-256: ${s.sha256}`)
              }
              if (s.fileSizeBytes !== undefined) {
                parts.push(`Size: ${s.fileSizeBytes} bytes`)
              }
              if (s.dimensions) {
                parts.push(`Dimensions: ${s.dimensions}`)
              }
              if (s.tags.length > 0) {
                parts.push(`Tags: ${s.tags.join(', ')}`)
              }
              const lastAction = s.provenance[s.provenance.length - 1]
              if (lastAction) {
                const note = lastAction.note ? ` — "${lastAction.note}"` : ''
                parts.push(
                  `Last action: ${lastAction.action}${note} at ${new Date(lastAction.timestamp).toLocaleString()}`,
                )
              }
              return parts.join('\n')
            })
            .join('\n\n')
        : 'No specimens are currently registered.'

    const truncationNote = truncated
      ? `\n\n(Note: ${allSpecimens.length - MAX_SPECIMENS_IN_CONTEXT} additional specimens exist but are not shown here. Use the wetlab_listSpecimens tool for a full listing.)`
      : ''

    const systemPrompt = [
      'You are an assistant for the Digital Wet Lab in the NiiVue VS Code extension.',
      'You help researchers manage and query their registered medical-imaging specimens (NIfTI, DICOM, etc.).',
      'You have access to the following registry of digital specimens:\n',
      registryContext + truncationNote,
      '\nAnswer the user\'s question using this registry data. Be concise and precise.',
      'When referencing a specimen, use its file name. Prefer bullet lists for structured data.',
      'If asked to perform an action (register, add note, remove), explain the VS Code command to use.',
      'Available commands: wetlab.registerSpecimen, wetlab.addNote, wetlab.removeSpecimen, wetlab.showProvenance.',
    ].join('\n')

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(request.prompt),
    ]

    try {
      const chatResponse = await model.sendRequest(messages, {}, token)
      for await (const chunk of chatResponse.text) {
        response.markdown(chunk)
      }
    } catch (err: unknown) {
      if (err instanceof vscode.LanguageModelError) {
        response.markdown(`⚠️ Language model error: ${err.message}`)
      } else {
        response.markdown('⚠️ An unexpected error occurred while contacting the language model.')
      }
    }
  }

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler)
  participant.iconPath = new vscode.ThemeIcon('beaker')
  return participant
}
