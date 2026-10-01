# Changelog

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
