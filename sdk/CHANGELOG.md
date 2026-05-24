# Changelog

All notable changes to the NexaPay Node.js SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-24

### Added
- Per-intent webhook URLs: `webhook_url`, `success_webhook_url`, `failure_webhook_url` fields on `CreatePaymentIntentRequest`
- `NEXAPAY_API_URL` environment variable support for base URL configuration
- Webhook retry with exponential backoff (up to 3 attempts)

### Changed
- Default `baseURL` now checks `NEXAPAY_API_URL` env var first, then config, then default
- User-Agent updated to 0.3.0

### Fixed
- Version string in User-Agent header was hardcoded to 0.1.1 (now reads from correct version)

## [0.2.0] - 2026-05-18

### Added
- SDK published to npm as `@nexapay/node-sdk`

## [0.1.1] - 2026-04-21

### Changed
- **BREAKING**: Updated default base URL from `https://nexapay.space/backend` to `https://backend.nexapay.space`
- Updated all example files to use the new production base URL
- Updated README.md documentation with correct production URLs
- Updated TypeScript examples to use the new base URL
- Updated SDK User-Agent header to version 0.1.1

### Fixed
- Fixed portal configuration to use correct backend URL in Dockerfile and docker-compose.yml
- Fixed frontend API client configuration to use production backend URL
- Updated SDK source code to remove localhost references (except in development comments)

### Notes
This release prepares the SDK for production use with the new subdomain architecture:
- Frontend portal: `https://nexapay.space`
- Backend API: `https://backend.nexapay.space`

## [0.1.0] - Initial Release

### Added
- Initial release of NexaPay Node.js SDK
- Complete TypeScript support with full type definitions
- Resource-oriented API design with intuitive client interface
- Support for all major NexaPay API endpoints:
  - Payment Intents (create, retrieve, confirm)
  - Merchants (register, statistics)
  - Refunds (create, list)
  - Payouts (create, list)
  - Balance & Transactions
  - Webhooks (create, list, verify)
  - Developer resources
- Comprehensive error handling with specific error classes
- Webhook signature verification utilities
- Automatic response format handling (supports mixed API response formats)
- Idempotency key support for payment intent creation
- Test card numbers for development and testing
- Full documentation with examples in both JavaScript and TypeScript
- Axios-based HTTP client with interceptors for error handling
- Configurable timeout and custom headers
- Environment-based configuration support

### Features
- Promise-based API for async/await usage
- Built-in rate limit awareness and backoff
- Configurable retry logic for transient failures
- CORS support for browser environments
- Automatic API response normalization
- Support for millimes currency (1 TND = 1000 millimes)
- Type-safe request and response interfaces
- Developer-friendly error messages and debugging information
- Compatible with Node.js 14.0.0 and above

### Documentation
- Complete README with quick start guide
- JavaScript usage examples
- TypeScript usage examples with full type safety
- API reference documentation
- Error handling examples
- Webhook integration guide
- Testing guidelines with test card numbers
- Development and build instructions