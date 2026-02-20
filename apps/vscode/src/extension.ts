import * as vscode from 'vscode'
import { NiiVueEditorProvider } from './editorProvider'
import { LinkHoverProvider } from './HoverProvider'
import { SpecimenRegistry } from './wetlab/registry'
import { SpecimenTreeItem, WetLabTreeProvider } from './wetlab/treeProvider'
import { registerWetLabTools } from './wetlab/llmTools'
import { registerWetLabChatParticipant } from './wetlab/chatParticipant'
import { HardwareDevice } from './wetlab/hardwareCatalog'
import { DeviceConnectionConfig, HardwareManager } from './wetlab/hardwareManager'
import { HardwareTreeItem, HardwareTreeProvider } from './wetlab/hardwareTreeProvider'

export async function activate(context: vscode.ExtensionContext) {
  // --- Digital Wet Lab: registry + sidebar ---
  const registry = new SpecimenRegistry(context)
  await registry.load()

  const treeProvider = new WetLabTreeProvider(registry)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('wetlab.specimens', treeProvider),
  )

  // --- Hardware Catalog tree view ---
  const hardwareManager = new HardwareManager(registry)
  context.subscriptions.push(hardwareManager)

  const hardwareTreeProvider = new HardwareTreeProvider(hardwareManager)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('wetlab.hardware', hardwareTreeProvider),
  )

  // Single shared output channel for all hardware detail/status output
  const hardwareChannel = vscode.window.createOutputChannel('Wet Lab Hardware')
  context.subscriptions.push(hardwareChannel)

  // Show hardware device details in the shared output channel
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'wetlab.showHardwareDetails',
      (device: HardwareDevice | undefined) => {
        if (!device) {
          return
        }
        const guide = device.implementationGuide
        const state = hardwareManager.getState(device.id)
        const statusLine = state?.connected
          ? `Status:     ✅ Connected (${state.specimenCount} specimen(s) acquired)`
          : `Status:     ○  Disconnected`
        const lines: string[] = [
          `🔧  Hardware Device: ${device.name} (${device.id})`,
          `${'─'.repeat(60)}`,
          `Category:   ${device.category}`,
          statusLine,
          ``,
          `Description:`,
          `  ${device.description}`,
          ``,
          `Supported Platforms:`,
          ...device.supportedPlatforms.map((p) => `  • ${p}`),
          ``,
          `Key Tools:`,
          ...device.keyTools.map((t) => `  • ${t}`),
          `${'─'.repeat(60)}`,
          `Prerequisites:`,
          ...guide.prerequisites.map((p) => `  • ${p}`),
          ``,
          `Setup Steps:`,
          ...guide.steps.map((s) => `  ${s}`),
          ``,
          `Code Example:`,
          `  ${guide.codeExample}`,
          ``,
          `Overlay365 Integration:`,
          `  ${guide.overlay365Integration}`,
        ]
        hardwareChannel.clear()
        lines.forEach((l) => hardwareChannel.appendLine(l))
        hardwareChannel.show(true)
      },
    ),
  )

  // Connect a hardware device (prompt for method + folder/URL)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'wetlab.hardware.connect',
      async (item: HardwareTreeItem | undefined) => {
        const device =
          item?.node.kind === 'device' ? item.node.device : undefined
        if (!device) {
          return
        }
        const method = await vscode.window.showQuickPick(
          [
            {
              label: '$(folder-opened) Folder Watcher',
              description: 'Watch a folder for new files (gPhoto2, Pycro-Manager, etc.)',
              value: 'folder-watcher' as const,
            },
            {
              label: '$(globe) HTTP REST',
              description: 'Connect to a REST API device (OpenFlexure, ImSwitch)',
              value: 'http-rest' as const,
            },
            {
              label: '$(terminal) CLI',
              description: 'Run a capture command in the terminal + watch output folder',
              value: 'cli' as const,
            },
          ],
          { title: `Connect ${device.name}`, placeHolder: 'Select acquisition method' },
        )
        if (!method) {
          return
        }

        const config: DeviceConnectionConfig = { method: method.value }

        if (method.value === 'folder-watcher' || method.value === 'cli') {
          const folders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Watch Folder',
            title: `Watch folder for ${device.name} output`,
          })
          if (!folders?.[0]) {
            return
          }
          config.watchFolder = folders[0].fsPath
        }

        if (method.value === 'cli') {
          const cmd = await vscode.window.showInputBox({
            prompt: `Capture command for ${device.name}`,
            placeHolder: device.implementationGuide.codeExample,
            value: device.implementationGuide.codeExample,
          })
          if (!cmd) {
            return
          }
          config.cliCommand = cmd
        }

        if (method.value === 'http-rest') {
          const url = await vscode.window.showInputBox({
            prompt: `REST API base URL for ${device.name}`,
            placeHolder: 'http://openflexure.local',
          })
          if (!url) {
            return
          }
          config.restUrl = url
        }

        try {
          await hardwareManager.connect(device.id, config)
          vscode.window.showInformationMessage(
            `🔌 ${device.name} connected via ${method.value}.`,
          )
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to connect ${device.name}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      },
    ),
  )

  // Disconnect a hardware device
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'wetlab.hardware.disconnect',
      (item: HardwareTreeItem | undefined) => {
        const device =
          item?.node.kind === 'device' ? item.node.device : undefined
        if (!device) {
          return
        }
        hardwareManager.disconnect(device.id)
        vscode.window.showInformationMessage(`🔌 ${device.name} disconnected.`)
      },
    ),
  )

  // Acquire from a connected hardware device
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'wetlab.hardware.acquire',
      async (item: HardwareTreeItem | undefined) => {
        const device =
          item?.node.kind === 'device' ? item.node.device : undefined
        if (!device) {
          return
        }
        try {
          await hardwareManager.acquire(device.id)
          treeProvider.refresh()
        } catch (err) {
          vscode.window.showErrorMessage(
            `Acquisition failed for ${device.name}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      },
    ),
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
