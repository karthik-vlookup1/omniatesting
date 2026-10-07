# Sprint Contract: agentOS sync never links tenancies: looks up core tenancy by '1234' but core stores 'T1234'

## Scope

- server/src/services/agentos/sync*
- server/src/domain/agentos/sync*
- server/test/int/agentos-sync*
- server/test/unit/agentos-sync*

## Verification Standards

- [unit] `npm run test:int -- agentos-sync`
- [unit] `npm run test:unit -- agentos-sync`

## Exclusions

- (none)
