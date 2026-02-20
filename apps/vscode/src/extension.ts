import * as vscode from 'vscode'
import { NiiVueEditorProvider } from './editorProvider'
import { LinkHoverProvider } from './HoverProvider'
import { SpecimenRegistry } from './wetlab/registry'
import { SpecimenTreeItem, WetLabTreeProvider } from './wetlab/treeProvider'
import { registerWetLabTools } from './wetlab/llmTools'
import { registerWetLabChatParticipant } from './wetlab/chatParticipant'

export async function activate(context: vscode.ExtensionContext) {
  // --- Digital Wet Lab: registry + sidebar ---
  const registry = new SpecimenRegistry(context)
  await registry.load()

  const treeProvider = new WetLabTreeProvider(registry)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('wetlab.specimens', treeProvider),
  )

  // Register the current file as a digital specimen
  context.subscriptions.push(
    vscode.commands.registerCommand('wetlab.registerSpecimen', async (uri?: vscode.Uri) => {
      const targetUri =
        uri ??
        (vscode.window.activeTextEditor?.document.uri as vscode.Uri | undefined) ??
        undefined
      if (!targetUri) {
        vscode.window.showWarningMessage('No file selected to register as a specimen.')
        return
      }
      const entry = await registry.register(targetUri)
      treeProvider.refresh()
      const checksum = entry.sha256 ? ` · SHA-256: ${entry.sha256.slice(0, 8)}…` : ''
      vscode.window.showInformationMessage(`🧪 Specimen registered: ${entry.name}${checksum}`)
    }),
  )

  // Open a registered specimen by its URI string (called from the tree view)
  context.subscriptions.push(
    vscode.commands.registerCommand('wetlab.openSpecimen', async (uriString?: unknown) => {
      if (typeof uriString !== 'string' || !uriString.trim()) {
        vscode.window.showWarningMessage('No specimen URI provided to open.')
        return
      }

      let uri: vscode.Uri
      try {
        uri = vscode.Uri.parse(uriString)
      } catch (error) {
        console.error('Failed to parse specimen URI:', error)
        vscode.window.showErrorMessage(`Invalid specimen URI: ${uriString}`)
        return
      }
      try {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'niiVue.default')
      } catch (error) {
        console.error('Failed to open specimen with NiiVue editor:', error)
        vscode.window.showErrorMessage('Unable to open specimen in NiiVue editor.')
      }
    }),
  )

  // Show full provenance chain in an output channel
  context.subscriptions.push(
    vscode.commands.registerCommand('wetlab.showProvenance', (item: SpecimenTreeItem) => {
      const entry = item?.specimenEntry
      if (!entry) {
        return
      }
      const lines: string[] = [
        `📊  Provenance Chain: ${entry.name}`,
        `${'─'.repeat(60)}`,
        `URI:        ${entry.uri}`,
        `Registered: ${new Date(entry.registeredAt).toLocaleString()}`,
      ]
      if (entry.fileSizeBytes !== undefined) {
        lines.push(`File size:  ${entry.fileSizeBytes.toLocaleString()} bytes`)
      }
      if (entry.sha256) {
        lines.push(`SHA-256:    ${entry.sha256}`)
      }
      if (entry.dimensions) {
        lines.push(`Dimensions: ${entry.dimensions}`)
      }
      if (entry.tags.length > 0) {
        lines.push(`Tags:       ${entry.tags.join(', ')}`)
      }
      lines.push(`${'─'.repeat(60)}`, 'History:')
      entry.provenance.forEach((p) => {
        const note = p.note ? ` — "${p.note}"` : ''
        lines.push(`  • [${new Date(p.timestamp).toLocaleString()}] ${p.action}${note}`)
      })

      const channel = vscode.window.createOutputChannel('Wet Lab Provenance')
      channel.clear()
      lines.forEach((l) => channel.appendLine(l))
      channel.show(true)
    }),
  )

  // Add a free-text note to a specimen's provenance
  context.subscriptions.push(
    vscode.commands.registerCommand('wetlab.addNote', async (item: SpecimenTreeItem) => {
      const entry = item?.specimenEntry
      if (!entry) {
        return
      }
      const note = await vscode.window.showInputBox({ prompt: `Note for "${entry.name}"` })
      if (note) {
        await registry.addNote(entry.id, note)
        treeProvider.refresh()
      }
    }),
  )

  // Remove a specimen from the registry
  context.subscriptions.push(
    vscode.commands.registerCommand('wetlab.removeSpecimen', async (item: SpecimenTreeItem) => {
      const entry = item?.specimenEntry
      if (!entry) {
        return
      }
      const answer = await vscode.window.showWarningMessage(
        `Remove specimen "${entry.name}" from the Wet Lab registry? This will permanently delete its provenance history.`,
        { modal: true },
        'Remove',
      )
      if (answer !== 'Remove') {
        return
      }
      registry.remove(entry.id)
      await registry.save()
      treeProvider.refresh()
    }),
  )

  // Refresh the tree view manually
  context.subscriptions.push(
    vscode.commands.registerCommand('wetlab.refresh', () => {
      treeProvider.refresh()
    }),
  )

  // Register LM tools so AI agents can call wet lab operations
  context.subscriptions.push(registerWetLabTools(registry, treeProvider))

  // Register the @wetlab chat participant
  context.subscriptions.push(registerWetLabChatParticipant(registry))

  // Pass the registry to the editor provider for auto-registration on open
  NiiVueEditorProvider.setRegistry(registry, treeProvider)

  // --- Existing NiiVue registrations ---
  context.subscriptions.push(NiiVueEditorProvider.register(context))
  context.subscriptions.push(vscode.languages.registerHoverProvider('*', new LinkHoverProvider()))
  context.subscriptions.push(
    vscode.commands.registerCommand('niivue.openWebLink', async () => {
      vscode.window
        .showInputBox({
          prompt: 'File Path',
          placeHolder: 'https://niivue.github.io/niivue-demo-images/mni152.nii.gz',
        })
        .then((input) => {
          if (input) {
            const uri = vscode.Uri.parse(input)
            NiiVueEditorProvider.createOrShow(context, uri)
          }
        })
    }),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('niiVue.openLink', async (args: any) => {
      NiiVueEditorProvider.createOrShow(context, args.resourceUri)
    }),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('niiVue.openLocal', async (args: any) => {
      vscode.commands.executeCommand('vscode.openWith', args.resourceUri, 'niiVue.default')
    }),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'niiVue.compareFromExplorer',
      async (_activeItem: any, items: any) => {
        NiiVueEditorProvider.createCompareView(context, items)
      },
    ),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'niiVue.openFromExplorer',
      async (_activeItem: any, items: any) => {
        const uri = vscode.Uri.parse(items[0])
        const stat = await vscode.workspace.fs.stat(uri)

        if ((stat.type & vscode.FileType.Directory) !== 0) {
          NiiVueEditorProvider.createOrShowDcmFolder(context, uri)
        } else {
          if (items && items.length >= 1) {
            vscode.commands.executeCommand('vscode.openWith', uri, 'niiVue.default')
          } else {
            vscode.window
              .showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: true,
                openLabel: 'Open Image or Mesh',
              })
              .then((uris) => {
                NiiVueEditorProvider.createCompareView(context, uris)
              })
          }
        }
      },
    ),
  )
}

export function deactivate() {}
