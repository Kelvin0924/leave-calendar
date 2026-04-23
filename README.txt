═══════════════════════════════════════════════════════
  TEAM LEAVE CALENDAR  —  Setup & Run Guide
═══════════════════════════════════════════════════════

REQUIREMENTS
────────────
  • Node.js v16 or later  (download from https://nodejs.org)

FIRST-TIME SETUP
────────────────
  1. Open a terminal / command prompt
  2. Navigate to this folder:
       cd path\to\leave-calendar
  3. Install dependencies (only needed once):
       npm install

STARTING THE APP
────────────────
  1. In the terminal, run:
       npm start   (or: node server.js)
  2. You will see:
       Team Leave Calendar is running!
       Open: http://localhost:3000
  3. Open your browser and go to:
       http://localhost:3000

CUSTOMISING YOUR TEAM
─────────────────────
  Edit  data/data.json  to replace the placeholder users
  with your real team members and their email addresses.

  Each user entry looks like this:
    {
      "id":     "u-a1",             ← keep unique, any string
      "name":   "Jane Smith",       ← display name
      "email":  "jane@company.com", ← used to log in
      "teamId": "accounting"        ← see team IDs below
    }

  Team IDs:
    management  → Management
    accounting  → Accounting  (sub-team of Controller)
    treasury    → Treasury & Payable  (sub-team of Controller)
    fpa         → FP&A
    credit      → Credit

  You can also assign users to "controller" directly if
  you want a parent-level Controller member who can see
  and edit both Accounting and Treasury & Payable records.

ACCESS RULES
────────────
  • Each user can add/edit/delete leave ONLY for members
    of their own team (or sub-teams of their team).
  • Management team members can view and edit ALL teams.
  • Controller-level users can edit both Accounting and
    Treasury & Payable.

LEAVE TYPES
───────────
  AL  — Annual Leave
  SL  — Sick Leave
  ECL — Emergency / Compassionate Leave
  UL  — Unpaid Leave
  MPL — Maternity / Paternity Leave
  PH  — Public Holiday
  OTH — Other

WFH POLICY
──────────
  • Each person is allowed a maximum of 2 WFH days per
    calendar month.
  • The badge on each member's column header shows their
    current usage (e.g. "WFH 1/2").
  • The server rejects a third WFH entry automatically.

DATA STORAGE
────────────
  All data is stored in  data/data.json  on the machine
  running the server.  Back this file up regularly.

RUNNING ON A SHARED SERVER
──────────────────────────
  To make this accessible to your whole team, run it on
  a server (Windows or Linux) that is always on, and
  have team members access it via the server's IP or
  hostname, e.g.  http://192.168.1.50:3000

  To change the port, edit the PORT constant in server.js.

═══════════════════════════════════════════════════════
