# Product Requirements Document: Profitability Tracker

**Status:** Draft v1.0
**Currency:** NPR (Nepalese Rupee)
**Default VAT Rate:** 13% (configurable)

---

## 1. Overview

The Profitability Tracker is an internal organizational tool that answers six core questions:

1. What profit margin are we getting from each client and project?
2. Which projects are bleeding money?
3. How well are employees being utilized across projects?
4. Are projects tracking on-budget, and what's the forecasted profit/loss at completion?
5. When do client AMCs (Annual Maintenance Contracts) need to be sent?
6. How much VAT has accumulated and is still unpaid?

The system centers on **stand-ups** as the primary data-collection mechanism for employees: during a stand-up, employee time is allocated across projects, which drives cost attribution, which drives profit/loss calculations per project, client, and category. **Core members** (see §6.4) contribute a separate, always-on cost stream to every project they're assigned to, independent of stand-ups.

---

## 2. Goals

- Give leadership real-time visibility into project and client profitability.
- Surface underperforming ("bleeding") projects before they become a problem.
- Quantify employee utilization based on actual logged contribution, not guesswork.
- Forecast whether a project will land on-budget given its fixed budget, timeline, and current cost run-rate.
- Automate AMC reminders so free maintenance windows don't quietly expire.
- Track VAT liability continuously and clear it in a controlled, auditable way.
- Maintain a tamper-evident audit trail of all system actions, visible only to super admins.

## 3. Non-Goals (v1)

- Invoicing / payment collection from clients (VAT clearing is an internal bookkeeping action, not an invoicing system).
- Payroll processing (salary is tracked for cost calculation only, not disbursed via this tool).
- Time tracking at the sub-task/hour level (allocation is done via stand-up percentage split, not timesheets).

---

## 4. User Roles

This system is for **internal operational use by Admins and Managers only** — employees and core members are not users of the system (they do not log in or have self-service access); they only exist as records managed by admins/managers.

| Role | Permissions |
|---|---|
| **Super Admin** | Full access + audit logs + system settings (VAT rate, health indicator thresholds, AMC free period, paid leave allowance) |
| **Admin** | Manage clients, projects, employees, core members, stand-ups, extensions, AMC, clear VAT payments, configure health indicator thresholds |
| **Manager/PM** | Run stand-ups, view dashboard/profitability for assigned projects, adjust time-split |

Exact role-permission mapping should be confirmed with stakeholders before build; assumption above is used for scoping.

---

## 5. Core Data Model

### 5.1 Entities & Relationships

- **Client** → has many **Projects**
- **Project** → belongs to one **Client**, one **Category**, has many **Employees** (via explicit **ProjectAssignment**), has many **Core Members** (via explicit **CoreMemberAssignment**), has one **AMC record** (once closed)
- **Employee** → has many date-wise **Salary Entries** (the latest-dated entry defines the employee's current salary — no separate "current salary" field), has many **ProjectAssignments**, has many **AttendanceRecords**
- **Core Member** → has many date-wise **Salary Entries** (same latest-dated-entry model as Employee), has many **CoreMemberAssignments**. Does **not** participate in stand-ups and has no leave/allocation-percentage concept.
- **ProjectAssignment** → links one **Employee** to one **Project** (defines which projects an employee is eligible to be allocated to during a stand-up)
- **CoreMemberAssignment** → links one **Core Member** to one **Project** (defines which projects incur that core member's full monthly salary as cost)
- **Category** → has many **Projects** (seeded: `Design`, `Development`; extensible)
- **Standup** → has many **StandupEntries** (one per active **employee** only — core members are never included), each entry has many **ProjectAllocations**
- **ProjectExtension** → belongs to one **Project**
- **AttendanceRecord** → belongs to one **Employee**, derived from each stand-up's `attendance_status` (one record per non-`present` occurrence: first-half leave, second-half leave, late, or absent), tracked per calendar month
- **AuditLog** → references an **Actor** (user), an **Action**, and a **Target Entity**

### 5.2 Key Entity Fields

**Client**
- `id`, `name`, `contact_info`, `created_at`, `status` (active/inactive)

**Project**
- `id`, `client_id`, `category_id`, `name`, `budget` (fixed amount, excl. VAT — the project's fixed budget, referred to elsewhere as "amount"), `start_date`, `end_date` (together define the project's fixed **timeline**), `status` (`active`, `extended`, `closed`, `under_amc`), `created_at`
- `is_vat_applicable` (bool, **set explicitly by the user at project creation**, defaults to `true`) — determines whether this project accrues any VAT liability at all. Set to `false` for projects where VAT doesn't apply (typically foreign/international clients, or any client who doesn't require VAT). See §6.9.
- `vat_rate_applied` (snapshot at creation, defaults to org setting; **ignored entirely if `is_vat_applicable` is `false`**)
- `auto_extended` (bool — true if the system auto-flipped status to `extended` because it wasn't closed by `end_date`)

**ProjectAssignment**
- `id`, `project_id`, `employee_id`, `assigned_at`, `unassigned_at` (nullable) — defines the pool of projects an employee can be allocated to in a stand-up

**CoreMemberAssignment**
- `id`, `project_id`, `core_member_id`, `assigned_at`, `unassigned_at` (nullable) — while active, this project incurs a **day-prorated share** of the core member's effective monthly salary as cost, calculated per day as `monthly_salary ÷ days in month ÷ number of currently active concurrent assignments for that core member on that day` (see §6.4 and §6.7 for the full cost model)

**ProjectExtension**
- `id`, `project_id`, `reason` (text, required), `amount` (defaults to `0` if not provided — always affects financial totals, even at 0), `is_profit` (derived), `is_auto` (bool — true for system-triggered extensions past `end_date`), `created_by`, `created_at`

**Employee**
- `id`, `name`, `email`, `status` (`active`, `left`), `date_joined`, `date_left` (nullable)
- No standalone `current_salary` field — an employee's current salary is always **derived** as the amount on their most recent (latest-dated) `EmployeeSalaryEntry`. See §6.3.

**EmployeeSalaryEntry**
- `id`, `employee_id`, `salary_amount`, `effective_date`, `changed_by`, `reason`, `created_at`, `updated_at`
- One row per date the employee's salary was set or changed — not a "history" trailing a separate live field. The entry with the **latest `effective_date`** (that is on or before "today," or before the date being calculated for) is the one used for that period's cost calculations. Editing or deleting any entry (past or present) **triggers a full recalculation** of all downstream figures that depended on it — see §6.3 and §7.

**Core Member**
- `id`, `name`, `email`, `status` (`active`, `left`), `date_joined`, `date_left` (nullable)
- No standalone `current_salary` field — same derivation rule as Employee (latest-dated salary entry = current salary).
- Structurally similar to Employee, but modeled as a **distinct entity** since core members never appear in stand-ups and their cost logic differs entirely (full salary per project vs. prorated/allocated).

**CoreMemberSalaryEntry**
- `id`, `core_member_id`, `salary_amount`, `effective_date`, `changed_by`, `reason`, `created_at`, `updated_at`
- Same date-wise entry model as `EmployeeSalaryEntry` (see above and §6.4): one row per date the salary was set/changed, latest `effective_date` = current salary, and editing any entry triggers recalculation of all downstream cost figures.

**AttendanceRecord** (one per non-`present` occurrence, derived from `StandupEntry.attendance_status` — employees only)
- `id`, `employee_id`, `date`, `month` (for month-wise grouping), `type` (`first_half_leave`, `second_half_leave`, `late`, `paid_absence`, `unpaid_absence` — the last two determined automatically based on whether the employee's paid-leave allowance for the month/period has been exceeded, per §6.5.4), `standup_id`

**Category**
- `id`, `name`, `is_seeded` (bool)

**Standup**
- `id`, `date`, `status` (`draft`, `in_progress`, `completed`), `created_by`, `participants` (all active **employees** by default — core members are never listed)

**StandupEntry** (one per employee per stand-up)
- `id`, `standup_id`, `employee_id`, `attendance_status` (`present` [default], `first_half_leave`, `second_half_leave`, `late`, `absent`), `notes_markdown` (nullable if absent), `project_allocations` (see below)

**ProjectAllocation** (child of StandupEntry)
- `project_id` (must be a project the employee has an active **ProjectAssignment** for), `percentage` (0–100, sum across an entry's allocations = 100 unless `attendance_status = absent`)

**AMCRecord**
- `id`, `project_id`, `set_date`, `free_until_date`, `reminder_sent_at`, `status` (`free_period`, `reminder_due`, `paid_pending`, `overdue`, `cancelled`), `cancelled_at`, `cancelled_remark` (optional)
- `amc_amount` (the paid AMC amount, excl. VAT — entered once the AMC moves to `paid_pending`; defaults to `0`/empty while still in `free_period`)
- `is_vat_applicable` (bool, **set explicitly by the user when the AMC is set up**, defaults to `true`) — independent of the parent project's `is_vat_applicable` flag, since a client's VAT status doesn't automatically change, but is tracked separately so it can be corrected per-AMC if needed. See §6.9.

**AuditLog**
- `id`, `actor_id`, `action` (enum, e.g. `PROJECT_CREATED`, `SALARY_UPDATED`, `VAT_CLEARED`, `EMPLOYEE_MARKED_LEFT`, `CORE_MEMBER_ASSIGNED`), `target_type`, `target_id`, `metadata` (JSON diff), `timestamp`

---

## 6. Feature Requirements

### 6.1 Client Management
- CRUD for clients.
- View all projects under a client with an aggregated profit/loss summary.
- **Cannot delete a client with any projects** — active, extended, closed, or under AMC — since deleting the client would orphan that project's historical financial/audit data. **Soft-deactivate instead.** See §6.17 for the disabled-state and confirmation-modal behavior around this.

### 6.2 Project Management
- CRUD for projects; each project has a **Category**, **Client**, and **fixed Budget (excl. VAT)** and a **fixed Timeline** (`start_date` → `end_date`).
- **VAT-applicable toggle:** at creation, the user explicitly sets whether the project **is VAT-applicable** (default `true`). This should be `false` for projects that don't carry VAT — typically foreign/international clients, or any client who doesn't require VAT for that engagement. If `false`, this project **never accrues any VAT liability**, regardless of the org's configured VAT rate. If `true`, VAT is calculated automatically at the org's configured rate (default 13%) on top of the entered budget, and tracked separately (see §6.9).
- Regardless of the VAT-applicable setting, **all project analytics, P/L, forecasts, and budget figures are always computed on the non-VAT (excl. VAT) amount** — VAT is tracked purely as a separate bookkeeping figure and never enters profitability calculations (see §6.7, §6.9).
- Project status lifecycle: `Active → Extended → Closed → Under AMC`. (Extended is a modifier/event, not necessarily exclusive of Active — see §6.6.)
- **Auto-extension:** if a project reaches its `end_date` and has not been marked `Closed` by an admin, the system automatically flips its status to `Extended` (flagged `auto_extended = true`) so it doesn't silently sit in limbo. Further manual extensions can then be logged against it as usual (see §6.6).
- Project detail view shows: total revenue (budget, excl. VAT), total attributed employee cost, total core member cost, net profit/loss, profit margin %, extension history, AMC status, **budget-vs-timeline forecast** (see §6.8), and utilization breakdown of employees/core members who worked on it.
- **Employee-project association:** admins/managers explicitly assign employees to a project (`ProjectAssignment`). Only employees assigned to a project are eligible to be allocated to it during a stand-up (see §6.5.3).
- **Core-member-project association:** admins/managers explicitly assign core members to a project (`CoreMemberAssignment`) — see §6.4.

### 6.3 Employee Management
- CRUD for employees. Salary is **not** a single editable field on the employee record — it's managed entirely through **date-wise salary entries** (`EmployeeSalaryEntry`, §5.2).
- **Salary entries:** an employee's salary is a list of `(effective_date, salary_amount)` rows, editable as a table — add, edit, or delete any row, for any date (past, present, or future), not just append-only "history." The row with the **latest `effective_date` on or before a given day** is the salary used for that day's cost calculations; the row with the latest `effective_date` overall is treated as the employee's **current salary** (no separate "current salary" field to keep in sync).
- **Entering historical data:** this table-based model is designed so past salary changes can be **backfilled or corrected** after the fact (e.g., onboarding an employee's full salary history retroactively, or fixing a mis-entered date/amount) — not just recorded going forward.
- **Recalculation on edit:** editing, adding, or deleting **any** salary entry — regardless of whether its date is in the past, present, or future — triggers a **full recalculation** of everything downstream that depends on it: historical stand-up cost attribution, project/client/category P/L for affected periods, forecasts, and the dashboard. This is the same recalculation guarantee described for core members in §6.4 and for VAT-rate snapshots elsewhere — nothing is "baked in" incorrectly and left stale after a correction.
- **Employee leaving:** mark employee `status = left` with a `date_left`. The employee:
  - No longer appears in new stand-ups.
  - Retains all historical stand-up/allocation data for reporting.
  - Is excluded from active headcount/utilization dashboards but remains queryable in historical reports.
- **Deletion is blocked, not just discouraged:** an employee **cannot be deleted** if they're tied to any other resource — existing `ProjectAssignment`s, any historical `StandupEntry`/`AttendanceRecord`, or any `EmployeeSalaryEntry`. In practice this means almost any employee who has ever done real work in the system can't be deleted. Marking them `status = left` (above) is the correct action instead — it preserves all historical cost/P&L data while removing them from active use. See §6.17 for how this is surfaced in the UI (disabled delete button + tooltip + confirmation modal for the cases where deletion genuinely is allowed, e.g., a record created by mistake with zero history).
- **Project assignment:** admins/managers assign an employee to one or more projects (`ProjectAssignment`); this pool determines which projects that employee can be allocated to in a stand-up (see §6.5.3).
- **Attendance & leave history:** each employee's profile (Employee Detail Page) shows:
  - **Totals** of **First Half Leave**, **Second Half Leave**, **Late**, and **Absent** occurrences — shown as overall totals and as a **month-wise breakdown** (date, count per month, running total) for each of the four, so patterns are visible at a glance.
  - Within the Absent total, the existing **paid vs. unpaid** split (§6.5.4) is still shown, alongside the employee's paid-leave balance/usage for the current period.
  - These totals are derived from `AttendanceRecord` (§5.2) and recalculate automatically as stand-ups are completed or edited.

### 6.4 Core Member Management
Core members are a **separate category of paid personnel**, distinct from employees:

- CRUD for core members. Salary uses the same **date-wise salary entry** model as employees (`CoreMemberSalaryEntry`, §5.2) — a table of `(effective_date, salary_amount)` rows, editable for any date including backfilled historical data, with the latest-dated row defining the current salary and any edit triggering a full recalculation of downstream cost/P/L figures. See §6.3 for the full behavior, which applies identically here.
- **Never appear in stand-ups.** Core members have no notes, no absence tracking, no leave balance, and no percentage-based allocation — they are entirely outside the stand-up workflow.
- **Added to projects directly**, via `CoreMemberAssignment` — an admin/manager assigns a core member to one or more projects.
- **Cost model — monthly salary divided across active projects, prorated by day:** a core member's effective monthly salary is divided across all projects they're concurrently assigned to **on a day-by-day basis** — e.g., a core member on 3 concurrent projects for the full month has their salary split ⅓ / ⅓ / ⅓ across those 3 projects. If they're unassigned from one project partway through the month, the split recalculates for the remaining days (e.g., 3-way split for the first half of the month, then 2-way split for the second half, once one assignment ends) rather than applying one flat divisor to the whole month. If assigned to only 1 project for the full month, that project bears the full salary.
- **Core member leaving:** mark `status = left` with a `date_left`; behaves the same as an employee leaving (removed from future cost accrual, historical data retained) — see §6.3's handling for the equivalent employee case.
- **Deletion is blocked** under the same rule as employees (§6.3): a core member **cannot be deleted** if tied to any `CoreMemberAssignment` or `CoreMemberSalaryEntry`. Use `status = left` instead. See §6.17.
- Core member cost is included in project, client, and category profit/loss totals (see §6.7) and in the budget-vs-timeline forecast (see §6.8), but core members are **excluded** from the Employee Utilization metric (§6.7), since utilization is a stand-up-derived concept that doesn't apply to them.

### 6.5 Stand-ups

#### 6.5.1 Creating a Stand-up
- A stand-up auto-includes **all currently active employees** as participants. **Core members are never included.**
- Stand-up has a date and a status (`draft`, `in_progress`, `completed`).

#### 6.5.2 Live Collaborative Stand-up
- Multiple users can open the same stand-up simultaneously.
- Real-time collaborative editing: concurrent users see **each other's live cursors** and edits (e.g., via a CRDT or operational-transform based sync, such as Yjs/Liveblocks) while editing markdown notes or allocation fields.
- Presence indicators show who else is currently viewing/editing the stand-up.

#### 6.5.3 Per-Employee Entry
For each employee listed in the stand-up:
- **Attendance status:** each employee entry has one attendance status for the day, chosen from: **Present** (default), **First Half Leave**, **Second Half Leave**, **Late**, or **Absent**.
  - **Only "Absent" triggers the disabling behavior:** marking an employee absent immediately **disables/greys out their markdown notes field** and **skips their project-allocation section** for that stand-up (no project gets time credited for that day). Absence does **not** automatically exclude the employee from that day's **cost** calculation — see the paid/unpaid leave logic in §6.5.4.
  - **First Half Leave, Second Half Leave, and Late are all treated as Present** for every purpose other than the attendance count itself: notes field stays enabled, the project-allocation section is shown and required exactly as for a normal present day, the full day's cost is attributed normally (no paid/unpaid leave logic applies), and utilization is unaffected. The only difference from a plain "Present" day is that the occurrence is recorded and counted separately for reporting (see the Employee Detail Page totals in §6.3).
- **Notes field:** free-form **Markdown** editor, per employee, for stand-up notes (only disabled when `attendance_status = absent`).
- **Project selection:** multi-select, restricted to **only the projects the employee is explicitly assigned to** (via `ProjectAssignment`, §6.2) — an employee cannot be allocated to a project they aren't associated with. Within that assigned set, projects are further filtered/flagged by their **closed-project and AMC eligibility rules** (§6.10) — a project whose AMC was rejected by the client (or that was closed with no AMC arranged) is **not selectable** without an admin override; a project with an **overdue** AMC remains selectable but shows a warning badge in the picker.
  - On selection, the system **automatically splits time 100% evenly** across the selected projects (e.g., 2 projects → 50/50, 3 projects → 33.33/33.33/33.34).
  - The percentage split is **manually adjustable** per project (e.g., drag slider or numeric input), with validation that the total always equals 100%.

#### 6.5.4 Paid Leave, Unpaid Leave & Absence Handling
- Each employee is entitled to a configurable number of **paid leave days** — default **4 days** — set org-wide in Settings (super admin only, since it affects historical cost baselines).
- This paid/unpaid balance logic applies **only to `attendance_status = absent`**. First Half Leave, Second Half Leave, and Late never draw down the paid leave balance and never affect cost calculation — they're treated as ordinary present days for those purposes (see §6.5.3).
- When an employee is marked **absent** in a stand-up:
  - If their **paid leave balance for the relevant period has not been exhausted**, the absence is recorded as a **paid leave day**: the employee is **still included in that day's cost calculation** (their prorated daily cost is still counted as an organizational cost) even though no project allocation exists for that day (since no work was logged).
  - Once an employee's absences in a period **exceed their paid leave allowance**, subsequent absences are recorded as **unpaid leave**: from that point, the employee is **excluded from cost/contribution calculation** for those specific absent days.
- **Unpaid leave history:** for each employee, the system must show a **month-wise breakdown** of unpaid leave days taken (date, count per month, running total), so patterns of excessive absence are visible.
- Paid leave balance **resets monthly**: each calendar month, every active employee's paid leave allowance refreshes to the configured amount (default 4 days); unused days do not carry over to the next month.
- This entire section applies to **employees only** — core members have no leave/attendance concept since they never appear in stand-ups.


#### 6.5.5 Stand-up Completion
- Once marked `completed`, allocations become locked and feed into profitability and utilization calculations (editing after completion should be a permissioned, audit-logged action).

### 6.6 Project Extension
- From a project, a user can add an **Extension**:
  - **Reason** (required, free text).
  - **Amount** (optional — if not provided, it **defaults to `0`**. Regardless of whether an amount is entered, every extension is a financial event that **affects the project's financial totals** — a zero-amount extension simply has no monetary impact but is still logged and factored into the profit/loss recalculation for consistency).
  - Extensions can be **manual** (admin/manager-initiated) or **automatic** (system-triggered when a project passes its `end_date` unclosed — see §6.2). Auto-extensions are flagged `is_auto = true`, carry `amount = 0`, and use a **fixed system-generated reason** (e.g., "Automatically extended — project was not closed by its end date"). This reason text is not editable, to keep a clear, consistent audit trail distinguishing system actions from manual ones.
  - When a project is auto-extended, the system **sends an email notification to all admins** (org-wide, not just those tied to the specific project/client) so the auto-extension doesn't go unnoticed.
- The system determines and visually indicates whether the extension amount represents **profit** (client paid more than the additional cost incurred) or **loss** (extension granted for free / cost incurred exceeds amount), and recalculates:
  - The impact of the extension on the project's total profit/loss.
  - A running history of all extensions on the project timeline.

### 6.7 Profitability & Utilization Calculation

**Employee Daily Cost Rate** = `employee's effective monthly salary at that time / number of calendar days in that month` (weekends and holidays are **included** in the divisor — i.e., a flat calendar-day proration, not a working-day proration). "Effective monthly salary at that time" is looked up from the employee's `EmployeeSalaryEntry` table (§5.2, §6.3) — the entry with the latest `effective_date` on or before the date in question. Core members use the equivalent `CoreMemberSalaryEntry` lookup for the cost model below.

**Note:** all figures in this section (project budget, extension amounts, cost, profit/loss) are **excl. VAT**, regardless of a project's `is_vat_applicable` setting — VAT is tracked separately (§6.9) and never enters these calculations.

**Employee Cost (per project)** = Σ (for each stand-up entry where the employee worked on this project, or was on paid leave with no allocation that day — see §6.5.4) `Employee Daily Cost Rate × allocation %` (paid-leave days with no allocation are counted as organizational overhead cost, not attributed to any specific project).

**Core Member Cost (per project)** = Σ (for each calendar month the core member has an active `CoreMemberAssignment` on this project) the **day-weighted share** of their effective monthly salary for that month — calculated per day as `monthly salary ÷ days in month ÷ number of projects they were concurrently assigned to on that specific day`, summed across the days in the month. This means if a core member's concurrent project count changes mid-month (e.g., unassigned from one project partway through), the cost split adjusts day-by-day rather than using a single flat divisor for the whole month.

**Total Project Cost** = Employee Cost (per project) + Core Member Cost (per project)

**Project Profit/Loss** = Project Budget (excl. VAT) + Σ Extension Amounts − Total Project Cost

**Employee Utilization** = for a given period, the employee's allocated time across all projects vs. their available working time (i.e., how "spread thin" or "underutilized" they are — an employee marked **Absent** frequently, or with low total allocation, shows low utilization). **First Half Leave, Second Half Leave, and Late do not reduce utilization**, since they're treated as present days with normal allocation. **Core members are excluded from this metric** since it's derived from stand-up allocation, which doesn't apply to them.

**Client Profit/Loss** = Σ Profit/Loss of all projects under that client.

**Category Profit/Loss** = Σ Profit/Loss of all projects under that category.

### 6.8 Project Budget, Timeline & Forecasting
Every project has a **fixed budget** and a **fixed timeline** (`start_date` → `end_date`, §6.2). The system forecasts where the project is heading based on current cost run-rate from both employees and core members:

- **Cost Run-Rate** = the project's cost (Employee Cost + Core Member Cost per §6.7) incurred over the **most recently completed calendar month**, used as the basis for projecting forward.
- **Elapsed Timeline %** = time elapsed since `start_date` ÷ total planned duration (`start_date` → `end_date`).
- **Projected Total Cost at Completion** = actual cost incurred to date + (Cost Run-Rate × remaining months until `end_date`, or until the current forecast date if the project has already passed `end_date` and is running under auto-extension).
- **Forecasted Profit/Loss** = Project Budget (excl. VAT) + Σ Extension Amounts to date − Projected Total Cost at Completion.
- The forecast is shown alongside the **actual-to-date** profit/loss on the project detail view, so admins can see both "where we stand today" and "where we're headed if nothing changes."
- If the Cost Run-Rate implies the project will exceed its budget before `end_date` is reached, the project is visually flagged (e.g., "Trending Over Budget") on the **dashboard and project view only** — this is a visual indicator, not an emailed notification, independent of the Project Health Indicator thresholds (§6.13), since a project can be currently profitable but forecasted to bleed later (or vice versa).
- The forecast recalculates automatically as new stand-ups are completed and core member assignments change.

### 6.9 VAT Tracking
- VAT rate defaults to **13%**, configurable in Settings (super admin only, since it affects all future project calculations).
- **VAT applicability is set per-project and per-AMC, by the user, not inferred automatically.** Two independent flags:
  - `Project.is_vat_applicable` — set when the project is created (default `true`). Typically set to `false` for foreign/international clients or any client who doesn't require VAT.
  - `AMCRecord.is_vat_applicable` — set when the AMC is set up (default `true`), independent of the parent project's flag.
- **Only VAT-applicable projects/AMCs accrue VAT.** A project (or AMC) with its flag set to `false` never contributes to the accumulated VAT total, no matter what its budget or amount is.
- For VAT-applicable projects: budget (entered excl. VAT) generates an accumulated VAT liability = `budget × vat_rate_applied` (plus VAT on any extension amounts).
- For VAT-applicable AMCs: the paid `amc_amount` (excl. VAT) generates VAT liability the same way once it moves to `paid_pending`.
- Dashboard shows **Accumulated VAT (Unpaid)** as a running total across all VAT-applicable projects and AMCs.
- An admin action **"Mark VAT as Paid"** clears the accumulated total (logs the cleared amount, date, and actor), starting a fresh accumulation period. A history of past VAT clearances should be viewable.
- **VAT is never used in project analytics.** All profit/loss, forecasting, budget-vs-actual, and dashboard comparison figures are computed on the **non-VAT (excl. VAT) amount** across the board — VAT-applicable and non-VAT-applicable projects are compared on a like-for-like basis this way. VAT exists solely as a separate accumulating liability figure (this section) and never enters the P/L formulas in §6.7–§6.8.

### 6.10 AMC (Annual Maintenance Contract) Tracking
- When a project's status is set to **Closed**, a **"Set AMC"** action becomes available.
- Setting AMC requires a **free-period end date** (the date until which maintenance is free).
- System states:
  - `Free Period` — within the free window.
  - `Reminder Due` — within the reminder lead time of the free-period end date. Default lead time is **7 days before expiry**, configurable in Settings (super admin only).
  - `Overdue` — free period has ended and no paid AMC has been arranged; system prominently reminds the admin to send the client an AMC offer/invoice.
  - `Cancelled` — client rejected the AMC.
- **Cancelling an AMC:** an admin/manager can take a **"Cancel AMC"** action (e.g., when the client rejects it), with an **optional remark** explaining why. This sets status to `Cancelled`, stops further reminders for that project, and is logged with `cancelled_at` and `cancelled_remark`.
- Reminders surface on the Dashboard and via **email** (email is the only reminder channel for now; in-app notifications may be considered in a future version).

**Stand-up eligibility for closed projects**
A project's `status` and its `AMCRecord.status` together determine whether it can still be selected in a stand-up:

| Project status | AMC status | Selectable in stand-up? |
|---|---|---|
| `active` / `extended` | — (no AMC yet) | Yes — normal. |
| `closed` | `Free Period`, `Reminder Due`, or paid/`Under AMC` | Yes — normal, ordinary AMC work. |
| `closed` / `under_amc` | `Overdue` | Yes, but **flagged**. The project shows an **"AMC Overdue" warning badge** in the stand-up project picker, on the project page, and in the dashboard's project list. The AMC being overdue doesn't stop support work from continuing (blocking it could hurt the client relationship while payment is being chased) — but cost accruing during this window must stay visible so it prompts collection follow-up, not a silent leak. |
| `closed` | `Cancelled` (client rejected the AMC) or no AMC set | **No** — not selectable in the normal project picker. There's no active paid relationship to attribute time to. |

- **Admin override for a cancelled/no-AMC closed project:** if an employee genuinely needs to log one-off work against such a project (e.g., a goodwill fix), an **admin/manager must explicitly re-enable it for that stand-up** via an override action (logged with who approved it and why). Time logged this way is tagged **non-billable / write-off**:
  - It **does not** get folded back into that project's already-closed budget/P/L (which stays frozen as of closure).
  - It **is** counted toward the employee's cost/utilization and toward an org-wide **non-billable cost** total, so the org can see how much unattributed work is happening.
- This eligibility check runs at the point of **project selection** in the stand-up (§6.5.3), not after the fact — so cost against a rejected AMC can't accumulate by accident.

### 6.11 Project Categories
- Seeded categories: `Design`, `Development`.
- Admin can add/edit/deactivate categories.
- Category-level profit/loss view, matching the project/client-level breakdown.

### 6.12 Dashboard

**Date Range Selector**
- A date range filter (start date, end date) sits at the top of the dashboard.
- **Empty/unset range** → all stats show **overall (all-time) totals**, as today.
- **Valid range selected** → all dashboard stats recalculate to reflect **only activity within that range** — e.g., stand-up cost attribution, core member cost accrual, extensions, and VAT accrual that fall within the selected dates. Project/client/category profit-loss, top profitable/loss lists, VAT accumulation, and AMC reminders all respect the selected range where applicable (AMC reminders are inherently forward-looking regardless of a past date range, so they remain based on current date rather than the selected range).
- Clearing the range reverts to overall stats.

Displays:
- **Total Profit** (sum of positive project P/L, within selected range or overall)
- **Total Loss** (sum of negative project P/L, within selected range or overall)
- **Overall Profit/Loss %** (net margin across all projects, within selected range or overall)
- **Active Projects** count / **Closed Projects** count
- **Top 5 Profitable Projects** and **Top 5 Loss-Making Projects** (ranked lists, within selected range or overall)
- **Projects Trending Over Budget** (forecasted to exceed budget before completion — see §6.8)
- **Accumulated (unpaid) VAT**
- **AMC reminders** (projects with reminder due / overdue)
- **Category breakdown** (profit/loss per category, within selected range or overall)
- **Project Health Indicators** (see §6.13) — visual flags (e.g., green/yellow/red) per project based on configurable thresholds

**Mobile Responsiveness**
- The dashboard must be **fully usable on mobile viewports** (phone and tablet widths), not just a scaled-down desktop layout:
  - **Layout reflow:** the stat cards (Total Profit, Total Loss, Overall Profit/Loss %, Active/Closed counts, Accumulated VAT, etc.) stack into a **single column** below a tablet breakpoint, instead of the multi-column grid used on desktop.
  - **Ranked lists** (Top 5 Profitable/Loss-Making Projects) and the **Category breakdown** remain fully readable at narrow widths — condensed rows or horizontal scroll for any wide numeric columns, rather than tables getting clipped or requiring pinch-zoom.
  - **Date Range Selector** collapses to a mobile-friendly picker (e.g., a bottom-sheet/modal date picker) rather than the desktop inline dual-calendar widget.
  - **Sidebar navigation** collapses into a **hamburger/off-canvas menu** on mobile, consistent with how it's accessed via the Command Palette (§6.15) as an alternative.
  - **Health indicator badges** (§6.13) and **AMC Overdue warning badges** (§6.10) remain visible and legible at mobile widths — they should not be truncated or hidden.
  - Touch targets (buttons, filter chips, list rows) meet a minimum comfortable tap size; no functionality on the dashboard should be **mouse-hover-only** (e.g., a tooltip-only detail must also be reachable by tap).
- This mobile-responsive treatment applies to the dashboard specifically for v1; other screens (stand-up entry, admin CRUD forms, audit logs) are desktop-first for now and can be revisited in a later version.

### 6.13 Configurable Project Health Indicators (Settings)
- Admins (and super admins) can configure thresholds that classify a project's health. Sensible defaults (editable):
  - **Healthy** (green): profit margin **≥ 20%**
  - **At Risk** (yellow): profit margin **0% to 20%**
  - **Bleeding** (red): profit margin **< 0%** (i.e., a net loss)
- Thresholds apply org-wide and are reflected as visual badges throughout the dashboard, project list, and client view.
- These indicators are based on **actual profit/loss to date**; the separate "Trending Over Budget" flag (§6.8) is based on the **forecast** and can differ from the current health badge.

### 6.14 Audit Logs
- Every create/update/delete action of consequence is logged: client, project, employee, core member (including salary changes and leave status), stand-up completion/edit, extensions, VAT clearance, AMC changes, settings changes.
- **Visible only to Super Admin.**
- Filterable by:
  - **Action type** (e.g., "Salary Updated", "Project Closed", "VAT Cleared", "Core Member Assigned", "DB Snapshot Downloaded")
  - **User (actor)**
  - Combinable filters (action **and/or** user)
- Each entry shows: timestamp, actor, action, target entity, and a readable diff/summary of what changed.
- **Retention:** logs are kept **indefinitely** for now (no automatic archival or deletion policy in v1).

### 6.15 Command Palette (Global Navigation)
- **Trigger:** `Ctrl+K` on Windows/Linux, `Cmd+K` on Mac. Opens an overlay search box from anywhere in the app.
- **Scope:** searches across **Projects**, **Employees**, **Clients**, **Core Members**, and the app's own **sidebar navigation destinations** (Dashboard, Stand-ups, Settings, Audit Logs, etc.) in a single unified, fuzzy-matched result list. Selecting a result navigates directly to that project/employee/client's detail page or that nav destination.
- **Recents:**
  - The palette stores the **5 most recently accessed commands** (any mix of entities and nav destinations), shown in a distinct "Recent" group at the top when the palette is opened with an empty query.
  - **No repeats:** if the user re-selects an item already in the recents list, it **moves to the top** rather than being added as a duplicate entry — the list is always up to 5 *unique* items, most-recent-first.
  - Recents are stored **client-side** (browser `localStorage`, not the database), since this is a personal navigation convenience rather than shared/auditable data.
- **Keyboard navigation:**
  - Arrow **Up/Down** move the highlighted selection; **Enter** activates the highlighted item; **Esc** closes the palette.
  - The **Recents group and the main results list are navigated as one continuous, linear list** — there is no jump, skip, or re-highlight glitch when the selection crosses from the last "Recent" item to the first regular result (or vice versa going up). Internally this means the palette maintains a single flat index across both groups rather than tracking "recent index" and "results index" separately.
- **Empty/no-match state:** if the query matches nothing, show a plain "No results" state (no recents shown once there's an active query — recents are an empty-query convenience only).

### 6.16 Dark Mode
- A **light/dark theme toggle**, accessible from the sidebar/settings area.
- **Default:** on first visit (no stored preference yet), the app follows the **OS/browser's system preference** (`prefers-color-scheme`).
- **Persistence:** once the user explicitly picks a theme, that choice is saved to **`localStorage`** and takes precedence over system preference on all future visits **in that browser** (this is a per-browser/device preference, not synced to the user's account across devices, consistent with how recents are stored in §6.15).
- If the user has never explicitly chosen a theme, the app should continue to **follow live system-preference changes** (e.g., OS switches to dark mode at sunset) rather than freezing at whatever was detected on first load.

### 6.17 Confirmation Modals & Disabled-State Tooltips
- **Confirmation modal required before:**
  - **Logging out.**
  - **Any delete action**, across all entities (clients, projects, employees, core members, categories, salary entries, etc.) — including cases where deletion is actually allowed (see the blocking rules in §6.1/§6.3/§6.4 for cases where it's blocked entirely rather than just confirmed).
  - **Any action that triggers a full recalculation** — most notably editing or deleting a past `EmployeeSalaryEntry`/`CoreMemberSalaryEntry` (§6.3, §6.4), since this silently re-derives historical cost/P&L across every affected project. The modal should say plainly what will be recalculated (e.g., "This will recalculate cost and profit/loss for N projects between [date] and today. Continue?").
  - Other clearly destructive/hard-to-reverse actions already called out elsewhere in this doc follow the same pattern even if not restated here (e.g., cancelling an AMC, clearing accumulated VAT, downloading a new DB snapshot per §6.18).
  - Every confirmation modal must have a clear **Cancel** action as the safe default (not pre-focused on the destructive confirm button), and the destructive action should be logged to the Audit Log (§6.14) once confirmed.
- **Disabled-button tooltips:** wherever a button is disabled because an action isn't currently allowed (e.g., "Delete" on a client with existing projects, "Delete" on an employee with stand-up history, an AMC action that's not yet applicable), **hovering the disabled button shows a tooltip explaining why** (e.g., "Cannot delete: employee has 42 stand-up entries. Mark as left instead."). On touch devices where hover isn't available, tapping the disabled control reveals the same tooltip (consistent with the no-hover-only rule already set for the mobile dashboard in §6.12).

### 6.18 Database Snapshot Export (Super Admin)
- In **Settings**, a **Super Admin**-only action lets the admin **download a full snapshot of the current database** at any point in time (e.g., an export/dump file), for backup/audit purposes outside the system.
- **Single-snapshot retention:** the system keeps **at most one** generated snapshot at a time. Generating/downloading a new snapshot **deletes the previous one** as part of the same action — there's no snapshot history or archive to browse. This is confirmed via the standard confirmation modal (§6.17), since it's a destructive action for the prior snapshot: *"Downloading a new snapshot will replace and permanently delete the existing one. Continue?"*
- The snapshot action (both generation and the resulting deletion of the prior file) is recorded in the **Audit Log** (§6.14), including the actor and timestamp.
- This is a manual, on-demand export — not a scheduled/automatic backup job in v1.

---

## 7. Edge Cases & Business Rules

| Scenario | Handling |
|---|---|
| Employee salary increased mid-project | A new salary entry is added with its `effective_date`; historical cost calculations use the salary entry effective at the time of each stand-up, only stand-ups from the new `effective_date` onward use the new salary. |
| Core member salary increased mid-project | Same principle: a new salary entry is added; months before the new entry's `effective_date` use the prior entry's salary, months after use the new one. |
| Admin edits/backfills a past salary entry (any employee or core member) | The system **fully recalculates** all downstream figures that depended on that period — stand-up cost attribution, project/client/category P/L, forecasts, and dashboard totals — for the affected date range. Not treated as a note; it's a real retroactive recalculation. |
| Admin deletes a salary entry | Allowed; the salary in effect for the now-uncovered date range falls back to whichever remaining entry has the latest `effective_date` on or before that range. Triggers the same full recalculation. |
| Project marked non-VAT-applicable (e.g., foreign client) | Project accrues **no VAT liability** regardless of budget or extensions; project analytics (P/L, forecast) are unaffected either way since they're always computed excl. VAT. |
| AMC's VAT-applicable flag differs from its parent project's | Allowed and independent — e.g., a VAT-applicable project can have a non-VAT-applicable AMC if the maintenance arrangement itself doesn't carry VAT, or vice versa. |
| Employee leaves the organization | Marked `left`, excluded from future stand-ups/active utilization views, but historical data is retained for reporting and audit. |
| Core member leaves the organization | Marked `left`; excluded from future cost accrual on all assigned projects going forward, but historical cost data is retained. |
| Employee marked absent, within paid leave allowance | Notes field disabled, no project allocation for the day, but the employee's prorated daily cost **is still counted** (as overhead) toward that day's cost calculation. Recorded as a paid leave day. |
| Employee marked absent, paid leave allowance already exhausted | Recorded as **unpaid leave**; employee is **excluded** from cost calculation for that day. Reflected in their month-wise unpaid leave history. |
| Employee marked First Half Leave, Second Half Leave, or Late | Treated identically to Present: notes field enabled, project allocation shown/required, full day's cost attributed normally, no paid-leave balance impact. Only difference is the occurrence is logged as an `AttendanceRecord` and counted in that status's total on the Employee Detail Page. |
| Employee tries to log time against a closed project whose AMC was rejected (or has no AMC) | Project is **not selectable** in the normal picker. An admin/manager can grant a one-off **override**, which tags the logged time as **non-billable/write-off** — counted in org-wide cost and the employee's utilization, but excluded from that project's (already-frozen) P/L. |
| Employee logs time against a closed project whose AMC is Overdue | Selectable and logged normally, but the project shows an **"AMC Overdue" warning badge** in the picker, project page, and dashboard, so the accruing cost stays visible and prompts payment follow-up rather than going unnoticed. |
| Allocation percentages don't sum to 100% | System blocks stand-up completion until corrected (validation error). |
| Employee selects a project they aren't assigned to | Not selectable — the project list offered during a stand-up is restricted to the employee's assigned projects only. |
| Core member assigned to multiple concurrent projects | Their monthly salary is **divided equally** among all currently active project assignments — e.g., 3 concurrent projects each bear ⅓ of the salary as cost, not the full amount each. |
| Project extension with no amount entered | Amount defaults to `0`; the extension is still logged as a financial event and factored into the project's P/L recalculation (net effect is zero, but it's not merely a note). |
| Project extension with amount but cost exceeds it | Flagged as a loss-generating extension; reflected in project P/L and visually indicated (e.g., red badge). |
| Project reaches its end date without being closed | System **auto-extends** it (status → `Extended`, flagged `auto_extended`) with a fixed system reason and `amount = 0`; an **email is sent to all admins**; further manual extensions can be logged against it afterward. |
| Project's cost run-rate implies it will exceed budget before its end date | Flagged "Trending Over Budget" on the dashboard/project view, independent of its current (actual-to-date) health indicator color. |
| AMC free period expires with no action | Project AMC status flips to "Overdue"; persistent reminder shown (via email) until admin acts (sets paid AMC, cancels it, or otherwise resolves). |
| Client rejects the AMC | Admin/manager uses "Cancel AMC" action with an optional remark; status becomes `Cancelled` and reminders stop for that project. |
| VAT rate changed in Settings | Only applies to new projects going forward; existing projects retain the VAT rate snapshot from their creation (`vat_rate_applied`) to avoid retroactively altering historical figures. |
| Paid leave allowance changed in Settings | Applies going forward; historical paid/unpaid leave classification for past periods is not retroactively recalculated. |
| Two admins editing the same stand-up concurrently | Live cursors and real-time sync prevent silent overwrites; last-write-wins is avoided via collaborative editing (CRDT/OT). |
| Client deletion attempted while they have any projects (active or closed) | Blocked entirely (delete button disabled with an explanatory tooltip, §6.17); client must be soft-deactivated instead. |
| Employee/Core Member deletion attempted while tied to assignments, salary entries, or (for employees) stand-up/attendance history | Blocked entirely, same pattern as client deletion above; mark `status = left` instead (§6.3, §6.4). |
| Employee/Core Member deletion attempted with **zero** history (e.g., created by mistake, never assigned or paid) | Allowed, but still requires the standard delete confirmation modal (§6.17) before proceeding. |
| Admin edits/deletes a past salary entry | Confirmation modal (§6.17) shown first, stating what will be recalculated and the affected date range/projects, before the recalculation in §6.3/§6.4/§7 proceeds. |
| Super Admin downloads a new DB snapshot while a previous one exists | Confirmation modal warns the previous snapshot will be deleted; on confirm, the new snapshot is generated and the old one removed, both logged to the Audit Log (§6.18). |
| Dashboard date range left empty | Shows overall (all-time) stats. |
| Dashboard date range set to a valid range | All applicable stats (profit/loss, VAT accrued, top projects, category breakdown) recalculate for that range only. |

---

## 8. Non-Functional Requirements

- **Real-time collaboration:** stand-up editing must support multiple concurrent editors with sub-second cursor/content sync.
- **Auditability:** audit logs must be immutable (append-only) and tamper-evident.
- **Data integrity:** VAT-rate snapshots (`vat_rate_applied`) must never be altered retroactively by later org-wide Settings changes. Salary entries are the one deliberate exception to "never altered retroactively": admins can intentionally edit/backfill any date-wise salary entry, and the system must then correctly recalculate all dependent figures (§6.3, §7) — this is a supported user action, not an unintended side effect of an unrelated config change.
- **Access control:** role-based permissions enforced at the API layer, not just UI.
- **Currency:** all monetary values stored and displayed in NPR.
- **Performance:** dashboard aggregate stats and forecasts should load quickly even as stand-up/allocation history grows (consider pre-aggregation or caching for historical rollups).
- **Client-side preferences:** command palette recents (§6.15) and the dark-mode setting (§6.16) are stored in browser `localStorage` — per-browser/device, not synced across devices or persisted server-side.
- **Responsiveness:** the dashboard (§6.12) must render correctly across standard phone, tablet, and desktop breakpoints; dark mode (§6.16) must apply consistently across all of them.

---

## 9. Open Questions for Stakeholders

1. ~~The default health-indicator thresholds (20% / 0–20% / <0%) are a reasonable starting point but should be validated against actual historical margins once real project data is available — are these in the right range for this business?~~ **Resolved for v1:** keep the current thresholds as the starting point; revisit and tune once real historical margin data is available.

---

## 10. Success Metrics

- % reduction in projects reaching "Overdue" AMC status without a reminder having been actioned.
- Time-to-detect a bleeding project (from project going negative to it being flagged on dashboard) — target: real-time/next stand-up cycle.
- % of projects where the forecasted profit/loss at the midpoint of the timeline matches the actual outcome at completion (forecast accuracy).
- Adoption: % of active employees appearing in completed stand-ups per week.
- Reduction in unpaid/untracked VAT discrepancies at audit time.
