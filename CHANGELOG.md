# Changelog

## [1.2.1](https://github.com/Project-SandStar/AxonMcpServer/compare/v1.2.0...v1.2.1) (2026-10-27)


### Bug Fixes

* **dashboard:** rebuild so project workflow ids (with slashes) are URL-encoded; fixes "API error: Not Found" on /dashboard/workflows

## [1.2.0](https://github.com/Project-SandStar/AxonMcpServer/compare/v1.1.1...v1.2.0) (2026-10-25)


### Features

* **workflows:** instance-level shared workflows in globalWorkflow/ ([d491cd7](https://github.com/Project-SandStar/AxonMcpServer/commit/d491cd76e5ef1d4979da37d5f3962fae365ae0b0))
* **workflows:** load per-project workflows from workflows/proj ([a02ba86](https://github.com/Project-SandStar/AxonMcpServer/commit/a02ba863f93f9a3ff842131694789399d554d3f2))
* **workflows:** saveProjectWorkflow tool; show project workflows on switch ([97c6d87](https://github.com/Project-SandStar/AxonMcpServer/commit/97c6d87d043d1ec4ace301e5c7ec252f6f7e4334))


### Bug Fixes

* **plugin:** rebuild dist with the fav-creation and bassgMilesight workflow skills ([4dfa048](https://github.com/Project-SandStar/AxonMcpServer/commit/4dfa048e18237018e58152f608577d4431834101))

## [1.1.1](https://github.com/Project-SandStar/AxonMcpServer/compare/v1.1.0...v1.1.1) (2026-10-19)


### Features

* **plugin:** Claude Code plugin, installable from git and the Project Sandstar MCP marketplace ([ee8a2f4](https://github.com/Project-SandStar/AxonMcpServer/commit/ee8a2f46e88d932e214109adf539408556613d2f))

## [1.1.0](https://github.com/Project-SandStar/AxonMcpServer/compare/v1.0.0...v1.1.0) (2026-10-01)


### Features

* **auth:** identify MCP users per session and persist their project ([f49290f](https://github.com/Project-SandStar/AxonMcpServer/commit/f49290f08c3fd0f6fddaef9b008261bc25427cc6))
* **skyspark:** keep each client's project behind mcp-proxy and across restarts ([997acea](https://github.com/Project-SandStar/AxonMcpServer/commit/997acea6d3bab99091f40a2079e4750433e4b93b))
* **skyspark:** per-session project scope, pooled logins, reauthenticate tool ([742c43d](https://github.com/Project-SandStar/AxonMcpServer/commit/742c43dcc9bae2bfd91c7b3b6bbb57ab163542f4))


### Bug Fixes

* **auth:** log in again on 403, which SkySpark sends for a token from before a restart ([0326f26](https://github.com/Project-SandStar/AxonMcpServer/commit/0326f266a4be3ad40b7872e4156731935ee2e17e))
* **config:** ignore *.example.json instances and coerce non-array projects ([065ae51](https://github.com/Project-SandStar/AxonMcpServer/commit/065ae5105b5fb814f00bca57d07c525190a6f30d))
* **skyspark:** honor queryHaystack select; per-session setBy; session wording ([7e01a81](https://github.com/Project-SandStar/AxonMcpServer/commit/7e01a818cf357947b4509efb80cbcf0baacec7c5))
* **skyspark:** quote queryHaystack CSV fields and write plain numbers ([d9ad541](https://github.com/Project-SandStar/AxonMcpServer/commit/d9ad5419a44a3b73b75c72f17cdfc5493dc8b6d6))

## [1.0.0](https://github.com/Project-SandStar/AxonMcpServer/compare/v1.0.0...v1.0.0) (2026-06-08)


### Miscellaneous Chores

* release 1.0.0 ([c5b5e54](https://github.com/Project-SandStar/AxonMcpServer/commit/c5b5e54d680c3231b4df86069969d7931a530224))
