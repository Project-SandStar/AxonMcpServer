# Setting Up Your Anthropic API Key

The Axon VSCode extension requires an Anthropic API key to use AI-powered code generation features.

## Quick Start

### Method 1: Via Command Palette (Recommended - Secure Storage)

1. Open Command Palette: `⌘+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `Axon: Configure AI Provider`
3. Enter your Anthropic API key when prompted
4. The key is stored securely in VSCode's Secret Storage

### Method 2: Via Settings (Alternative - Visible in Settings)

1. Open VSCode Settings: `⌘+,` (macOS) or `Ctrl+,` (Windows/Linux)
2. Search for: `axon.ai.apiKey`
3. Paste your Anthropic API key
4. Save the settings

**Note:** This method stores the key in your settings file. For better security, use Method 1.

## Getting an Anthropic API Key

1. Visit: [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to **API Keys** section
4. Click **Create Key**
5. Copy your new API key
6. Use one of the methods above to add it to the extension

## Verify Your Setup

After adding your API key:

1. Open Command Palette: `⌘+Shift+P`
2. Type: `Axon: Check Extension Status`
3. Verify that "AI Provider" shows as configured ✓

## Which Storage Method Should I Use?

### Secure Storage (Method 1) - Recommended

**Pros:**
- ✅ Stored securely in VSCode's encrypted Secret Storage
- ✅ Not visible in settings files
- ✅ Not committed to git
- ✅ Synced securely across devices (if using Settings Sync)

**Cons:**
- ⚠️ Requires using the command to set

**Use when:**
- You want maximum security
- You're working in a team environment
- You sync your VSCode settings

### Settings Storage (Method 2) - Quick & Easy

**Pros:**
- ✅ Easy to set via UI
- ✅ Visible in settings for verification
- ✅ Can be set programmatically

**Cons:**
- ⚠️ Visible in plain text in settings
- ⚠️ Could be committed to git if settings are synced
- ⚠️ Less secure

**Use when:**
- You're testing locally
- You're the only user of your machine
- You understand the security implications

## Settings Location

### Workspace Settings
```json
// .vscode/settings.json
{
  "axon.ai.apiKey": "sk-ant-api03-..."
}
```

### User Settings
```json
// ~/Library/Application Support/Code/User/settings.json (macOS)
// %APPDATA%\Code\User\settings.json (Windows)
{
  "axon.ai.apiKey": "sk-ant-api03-..."
}
```

## Troubleshooting

### API Key Not Working

**Check the following:**

1. **Key Format:** Anthropic keys start with `sk-ant-api03-`
2. **Key Length:** Should be approximately 100+ characters
3. **Spaces:** Ensure no leading/trailing spaces
4. **Expiration:** Check if the key is still valid in Anthropic Console

### Command Not Found

If `Axon: Configure AI Provider` doesn't appear:

1. Ensure the extension is installed and activated
2. Reload VSCode: `⌘+Shift+P` → "Developer: Reload Window"
3. Check extension logs for errors

### Key Not Persisting

If the key disappears after restart:

1. Try using Settings method instead
2. Check VSCode's Secret Storage permissions
3. Verify your VSCode Settings Sync configuration

## Security Best Practices

### ✅ DO:
- Use Secure Storage (Method 1) when possible
- Rotate your API keys regularly
- Use separate keys for development and production
- Add `.vscode/settings.json` to `.gitignore` if storing in settings
- Revoke compromised keys immediately

### ❌ DON'T:
- Commit API keys to version control
- Share keys between team members
- Use production keys in development
- Store keys in public repositories
- Share keys in screenshots or logs

## Using the API Key

Once configured, the API key is automatically used for:

- **Code Generation:** `Axon: Generate Function`
- **Code Explanation:** `Axon: Explain Code`
- **Code Optimization:** `Axon: Optimize Code`
- **AI Chat Panel:** `Axon: Open AI Chat Panel`
- **Interactive Code Generation:** All AI-powered features

## Monitoring Usage

Track your API usage at:
- [https://console.anthropic.com/settings/usage](https://console.anthropic.com/settings/usage)

## Environment Variables (Advanced)

For CI/CD or automation, you can also set the key via environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

The extension will check (in order):
1. Secure Storage (via Command)
2. Settings (`axon.ai.apiKey`)
3. Environment Variable (`ANTHROPIC_API_KEY`)

## API Key Migration

If you need to move your key between storage methods:

### From Settings to Secure Storage

1. Copy your key from settings
2. Run: `Axon: Configure AI Provider`
3. Paste the key
4. Remove from settings: Delete `axon.ai.apiKey`

### From Secure Storage to Settings

1. Run: `Axon: Configure AI Provider` (to view current key)
2. Copy the key
3. Add to settings: `axon.ai.apiKey`
4. Optionally clear secure storage

## Multiple API Keys

To use different keys for different workspaces:

1. Use **Workspace Settings** instead of User Settings
2. Each workspace can have its own `axon.ai.apiKey`
3. Or use `Axon: Configure AI Provider` per workspace

## Related Documentation

- [Extension Configuration](./CONFIG_SYNC.md)
- [Configuration Editor](./CONFIG_EDITOR.md)
- [Anthropic Documentation](https://docs.anthropic.com/)

## Support

For issues with API key setup:

1. Check this guide first
2. Review [Troubleshooting](#troubleshooting) section
3. Check extension logs: `⌘+Shift+P` → "Developer: Show Logs"
4. Report issues on GitHub

## License

This extension is licensed under the Academic Free License (AFL) v. 3.0
