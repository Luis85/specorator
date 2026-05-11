---
id: ARC42-<AREA>-NNN
title: <Feature name> — Arc42 + 12-Factor Questionnaire
stage: design
feature: <feature-slug>
status: draft        # draft | answered | superseded
owner: architect
inputs:
  - PRD-<AREA>-NNN
  - RESEARCH-<AREA>-NNN
adrs: []             # ADRs filed from this questionnaire
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Architecture Questionnaire — Arc42 + 12-Factor Baseline

> **How to use:** Answer each question as thoroughly as you can. Leave `_TBD_` for items you haven't decided yet — these become open clarifications. Mark sections that don't apply to your project type as `N/A` with a one-line reason. The `arc42-baseline` skill drives this fill-in interactively; `/spec:design` reads the result as canonical input for Part C — Architecture.

---

## Part I — Arc42 Architecture Template

---

### 1 · Introduction and Goals

#### 1.1 Product Name and Purpose

> _What is the name and one-sentence purpose of your software system?_

```
_TBD_
```

#### 1.2 Top Functional Requirements

> _What are the top 3–5 functional requirements? List the core features that make your product valuable. Cite the upstream `REQ-<AREA>-NNN` ID for each._

1. _TBD_ — REQ-<AREA>-NNN
2. _TBD_ — REQ-<AREA>-NNN
3. _TBD_ — REQ-<AREA>-NNN

#### 1.3 Quality Goals

> _Rank by priority. At minimum address: Availability, Scalability, Security, Performance, Maintainability._

| Priority | Quality Goal | Scenario / Measure |
| -------- | ------------ | ------------------ |
| 1        | _TBD_        | _TBD_              |
| 2        | _TBD_        | _TBD_              |
| 3        | _TBD_        | _TBD_              |
| 4        | _TBD_        | _TBD_              |
| 5        | _TBD_        | _TBD_              |

#### 1.4 Stakeholders

| Stakeholder | Expectations |
| ----------- | ------------ |
| _TBD_       | _TBD_        |

#### 1.5 Business Context

> _How is the system monetised or funded? Who operates it? What is the deployment model (SaaS, on-prem, embedded, internal tool)? Expected user/tenant scale?_

```
Deployment model: _TBD_   # SaaS | on-prem | embedded | internal tool | hybrid
Monetisation / funding: _TBD_
Tenancy approach: _TBD_   # N/A if single-tenant or non-SaaS
Expected scale (year 1): _TBD_
Expected scale (year 2): _TBD_
```

---

### 2 · Constraints

#### 2.1 Technical Constraints

| Constraint | Rationale |
| ---------- | --------- |
| _TBD_      | _TBD_     |

#### 2.2 Organizational Constraints

| Constraint | Rationale |
| ---------- | --------- |
| _TBD_      | _TBD_     |

#### 2.3 Regulatory / Compliance Requirements

> _Check all that apply._

- [ ] GDPR
- [ ] SOC2
- [ ] HIPAA
- [ ] PCI-DSS
- [ ] ISO 27001
- [ ] FedRAMP
- [ ] Data Residency Requirements
- [ ] Other: _TBD_

#### 2.4 Compliance Details

```
_TBD_
```

---

### 3 · Context and Scope

#### 3.1 User Types / Actors

| Actor | Channel | Description |
| ----- | ------- | ----------- |
| _TBD_ | _TBD_   | _TBD_       |

#### 3.2 External System Integrations

| External System | Interface | Direction | Notes |
| --------------- | --------- | --------- | ----- |
| _TBD_           | _TBD_     | _TBD_     | _TBD_ |

#### 3.3 Data Flows Across System Boundary

**Inbound:**

```
- _TBD_
```

**Outbound:**

```
- _TBD_
```

#### 3.4 Geographic / Deployment Scope

- [ ] Single machine / on-premises
- [ ] Single Region (cloud)
- [ ] Multi-Region (same country)
- [ ] Multi-Region (multiple countries)
- [ ] Global (all major regions)
- [ ] Embedded / offline (no network dependency)

#### 3.5 Scope Details

```
Primary deployment location: _TBD_
Failover / DR location: _TBD_
Future expansion: _TBD_
Data sovereignty / residency notes: _TBD_   # N/A for offline or single-site deployments
```

---

### 4 · Solution Strategy

#### 4.1 Architectural Style

```
Style: _TBD_
Rationale: _TBD_
Evolution plan: _TBD_
```

#### 4.2 Technology Stack

| Layer            | Technology | Rationale |
| ---------------- | ---------- | --------- |
| Frontend         | _TBD_      | _TBD_     |
| Backend          | _TBD_      | _TBD_     |
| Database         | _TBD_      | _TBD_     |
| Cache            | _TBD_      | _TBD_     |
| Queue / Messaging| _TBD_      | _TBD_     |
| Object Storage   | _TBD_      | _TBD_     |
| Infrastructure   | _TBD_      | _TBD_     |
| CI/CD            | _TBD_      | _TBD_     |
| Monitoring       | _TBD_      | _TBD_     |

#### 4.3 Multi-Tenancy Strategy

> _Skip this section (mark N/A) if the system is not multi-tenant._

- [ ] N/A — single-tenant, on-premises, or embedded system
- [ ] Shared Database, Row-Level Isolation
- [ ] Schema per Tenant
- [ ] Database per Tenant
- [ ] Hybrid (shared for small, dedicated for enterprise)
- [ ] Single-Tenant Deployments (one instance per customer)

**Details / rationale:**

```
_TBD_
```

#### 4.4 Key Design Patterns

| Pattern | Where Applied | Rationale |
| ------- | ------------- | --------- |
| _TBD_   | _TBD_         | _TBD_     |

---

### 5 · Building Block View

#### 5.1 Major Modules / Services

| Module / Service | Responsibility |
| ---------------- | -------------- |
| _TBD_            | _TBD_          |

#### 5.2 Application Layers

```
_TBD_

Dependency rule: _TBD_
```

#### 5.3 Inter-Module Communication

```
Synchronous: _TBD_
Asynchronous: _TBD_
Event bus / broker: _TBD_
```

#### 5.4 Shared Libraries / Cross-Cutting Modules

| Library / Module | Purpose |
| ---------------- | ------- |
| _TBD_            | _TBD_   |

---

### 6 · Runtime View

#### 6.1 User Authentication Flow

```
1. _TBD_
```

#### 6.2 Core Business Workflow

**Scenario:** _TBD_

```
1. _TBD_
```

#### 6.3 Tenant / Instance Provisioning

> _Skip this section (mark N/A) if the system is not multi-tenant._

- [ ] N/A — single-tenant, on-premises, or embedded system

```
1. _TBD_
```

#### 6.4 Background Processes / Async Workflows

| Process | Trigger | Frequency | Notes |
| ------- | ------- | --------- | ----- |
| _TBD_   | _TBD_   | _TBD_     | _TBD_ |

---

### 7 · Deployment View

#### 7.1 Deployment Targets

- [ ] AWS
- [ ] Azure
- [ ] GCP
- [ ] Kubernetes
- [ ] Serverless (Lambda / Functions)
- [ ] Docker / Compose
- [ ] On-Premises

#### 7.2 Environments

| Environment   | Purpose | Infrastructure | Provisioning |
| ------------- | ------- | -------------- | ------------ |
| Local Dev     | _TBD_   | _TBD_          | _TBD_        |
| CI            | _TBD_   | _TBD_          | _TBD_        |
| Staging       | _TBD_   | _TBD_          | _TBD_        |
| Production    | _TBD_   | _TBD_          | _TBD_        |
| Demo / Sandbox| _TBD_   | _TBD_          | _TBD_        |

#### 7.3 CI/CD Pipeline

```
1. _TBD_

Deployment strategy: _TBD_
Rollback approach: _TBD_
```

#### 7.4 Infrastructure as Code

```
IaC tool: _TBD_
Secret management: _TBD_
Configuration management: _TBD_
```

---

### 8 · Crosscutting Concepts

#### 8.1 Authentication and Authorization

```
Authentication: _TBD_
Authorization:  _TBD_
Tenant isolation: _TBD_   # N/A if single-tenant or non-SaaS
API keys: _TBD_
```

#### 8.2 Observability Strategy

```
Logging: _TBD_
Metrics: _TBD_
Tracing: _TBD_
Alerting: _TBD_
SLOs: _TBD_
```

#### 8.3 Error Handling and Failure Strategy

```
Error types: _TBD_
Retry policy: _TBD_
Circuit breaker: _TBD_
Dead letter queue: _TBD_
Graceful degradation: _TBD_
```

#### 8.4 Data Management

```
Schema management: _TBD_
Backups: _TBD_
Data lifecycle: _TBD_
PII handling: _TBD_
Caching strategy: _TBD_
```

#### 8.5 Cross-Cutting Patterns

```
Correlation IDs: _TBD_
Rate limiting: _TBD_
Feature flags: _TBD_
API versioning: _TBD_
Audit logging: _TBD_
```

---

### 9 · Architecture Decisions

#### 9.1 Key Architecture Decision Records

> _List 3–5 key decisions. File each as an ADR via the `record-decision` skill before this questionnaire is marked answered._

| ADR    | Decision | Alternatives Considered | Rationale | Status   |
| ------ | -------- | ----------------------- | --------- | -------- |
| ADR-NNNN | _TBD_  | _TBD_                   | _TBD_     | proposed |

#### 9.2 Open Decisions

| #   | Open Question | Options | Leaning Toward | Blocked By |
| --- | ------------- | ------- | -------------- | ---------- |
| 1   | _TBD_         | _TBD_   | _TBD_          | _TBD_      |

#### 9.3 ADR Process

> _Defaults: lightweight ADR template at `templates/adr-template.md`, files under `docs/adr/NNNN-<slug>.md`, reviewed at design gate. Override only if your project differs. If using kit defaults, write `N/A — kit defaults apply` for all three fields below and link to `docs/sink.md`._

```
Format: _TBD_
Storage location: _TBD_
Review cadence: _TBD_
```

---

### 10 · Quality Requirements

#### 10.1 Availability Targets

```
Uptime SLA: _TBD_
RTO: _TBD_
RPO: _TBD_
Maintenance windows: _TBD_
```

#### 10.2 Performance Targets

```
API response time:    _TBD_
Page load time (LCP): _TBD_
Concurrent users:     _TBD_
Throughput:           _TBD_
Database query time:  _TBD_
```

#### 10.3 Scalability Requirements

```
Current load:    _TBD_
6-month target:  _TBD_
12-month target: _TBD_
Scaling approach: _TBD_
Scaling trigger:  _TBD_
```

#### 10.4 Security Quality Scenarios

| Scenario | Measure | Target |
| -------- | ------- | ------ |
| _TBD_    | _TBD_   | _TBD_  |

---

### 11 · Risks and Technical Debt

#### 11.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| _TBD_| _TBD_       | _TBD_  | _TBD_      |

#### 11.2 Intentional Technical Debt

| Debt | Why Accepted | Plan to Resolve | Deadline |
| ---- | ------------ | --------------- | -------- |
| _TBD_| _TBD_        | _TBD_           | _TBD_    |

#### 11.3 Unknowns and Assumptions

| Assumption | If Wrong, Impact | Validation Plan |
| ---------- | ---------------- | --------------- |
| _TBD_      | _TBD_            | _TBD_           |

---

### 12 · Glossary

> _Link to per-term files under `docs/glossary/<slug>.md` instead of duplicating definitions (per `docs/adr/0010-shard-glossary-into-one-file-per-term.md`). The legacy `docs/UBIQUITOUS_LANGUAGE.md` may also exist on older forks._

#### 12.1 Domain Terms

| Term  | Definition |
| ----- | ---------- |
| _TBD_ | _TBD_      |

#### 12.2 Acronyms and Abbreviations

| Acronym | Meaning |
| ------- | ------- |
| _TBD_   | _TBD_   |

---

## Part II — 12-Factor App Assessment

> The [12-Factor App](https://12factor.net) methodology. Originally coined for SaaS, but broadly applicable to any server-side or cloud-hosted system. Mark individual factors `N/A` if they genuinely don't apply to your deployment model (e.g. an offline embedded system has no concept of Factor X Dev/Prod parity). For each applicable factor, describe the planned approach and assess readiness.

### Readiness Summary

| Factor                 | Principle                                                   | Readiness                              |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------- |
| I. Codebase            | One codebase tracked in revision control, many deploys      | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| II. Dependencies       | Explicitly declare and isolate dependencies                 | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| III. Config            | Store config in the environment                             | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| IV. Backing Services   | Treat backing services as attached resources                | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| V. Build, Release, Run | Strictly separate build and run stages                      | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| VI. Processes          | Execute the app as one or more stateless processes          | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| VII. Port Binding      | Export services via port binding                            | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| VIII. Concurrency      | Scale out via the process model                             | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| IX. Disposability      | Maximize robustness with fast startup and graceful shutdown | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| X. Dev/Prod Parity     | Keep dev, staging, and production as similar as possible    | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| XI. Logs               | Treat logs as event streams                                 | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |
| XII. Admin Processes   | Run admin/management tasks as one-off processes             | `[ ] Ready [ ] Partial [ ] Gap [ ] N/A` |

---

### Factor I — Codebase

> _One codebase tracked in revision control, many deploys. Monorepo vs polyrepo? One codebase per deployable unit? How do staging/production relate to the same codebase?_

```
_TBD_
```

---

### Factor II — Dependencies

> _Package manager, lock files, system-level dependency isolation (containers), vendoring strategy._

```
_TBD_
```

---

### Factor III — Config

> _Environment variables, config services (Parameter Store, Vault), no config in code, secrets management._

```
_TBD_
```

---

### Factor IV — Backing Services

> _Databases, caches, queues, external services. Should be swappable via config. No difference between local and third-party services._

```
_TBD_
```

---

### Factor V — Build, Release, Run

> _Build = compile + bundle. Release = build + config. Run = execute release in environment. Immutable releases, rollback capability._

```
_TBD_
```

---

### Factor VI — Processes

> _No sticky sessions, no in-memory state that can't be lost. Session data in backing store. File uploads to object storage._

```
_TBD_
```

---

### Factor VII — Port Binding

> _Self-contained with embedded HTTP server. Not injected into a runtime container. Port configurable via env._

```
_TBD_
```

---

### Factor VIII — Concurrency

> _Scale by adding processes, not threads. Different process types for web, worker, scheduler. Horizontal scaling strategy._

```
_TBD_
```

---

### Factor IX — Disposability

> _Fast startup (seconds). Graceful shutdown on SIGTERM. Robust against sudden death. Reentrant workers (idempotent jobs)._

```
_TBD_
```

---

### Factor X — Dev/Prod Parity

> _Same backing services in dev (not SQLite for Postgres). Containerized dev. Short deploy cycles. Developers who deploy._

```
_TBD_
```

---

### Factor XI — Logs

> _Write to stdout. Never manage log files in the app. Log aggregation service collects and routes. Structured logging (JSON)._

```
_TBD_
```

---

### Factor XII — Admin Processes

> _Migrations, data fixes, console tasks. Run as one-off processes in the same environment. Ship with the codebase._

```
_TBD_
```

---

## Quality gate

- [ ] All sections have a non-`_TBD_` answer or a numbered entry in **9.2 Open Decisions**.
- [ ] Each "Accepted" row in **9.1** has a filed ADR under `docs/adr/`.
- [ ] Each `Partial` or `Gap` 12-Factor readiness has a follow-up in **9.2** or **11.2**.
- [ ] Every PRD requirement (`REQ-<AREA>-NNN`) is referenced at least once in §1.2 or §3.1 / §3.2.
- [ ] Open clarifications copied into `specs/<slug>/workflow-state.md` → Open clarifications.
