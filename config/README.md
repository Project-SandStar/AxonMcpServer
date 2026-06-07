# `config/` — SkySpark connection profiles

Each `*.json` file in this directory is a **SkySpark connection profile** (host,
port, credentials, and the projects available on that instance). The server
auto-discovers every `config/*.json` on startup.

> ⚠️ **Real config files contain credentials and are git-ignored.**
> Only the templates (`*.example.json`) and this README are tracked. Never commit
> a file with real usernames/passwords.

## Getting started

1. Copy the template:
   ```bash
   cp config/skyspark.example.json config/local-skyspark.json
   ```
2. Edit `config/local-skyspark.json` with your instance's host/port/credentials.
3. Add one profile per SkySpark instance you want the server to reach.

## Schema

| Field             | Type   | Notes                                            |
| ----------------- | ------ | ------------------------------------------------ |
| `name`            | string | Instance name shown in tool output               |
| `host`            | string | Hostname or IP of the SkySpark server            |
| `port`            | number | SkySpark port (e.g. `8080`, `8888`)              |
| `protocol`        | string | `http` or `https`                                |
| `username`        | string | SkySpark user                                    |
| `password`        | string | SkySpark password                                |
| `defaultProjName` | string | Project selected by default                      |
| `projects`        | object | Map of `{ name, description, username?, password? }` per project |

See `src/config/config.ts` for the full configuration model (server port, OAuth,
sync, and embedding settings), and the project root `README.md` for precedence
rules (`axon-config.json` > environment variables > defaults).
