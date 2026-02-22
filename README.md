# K2 Vibe

AI-powered development platform that lets you create web applications by chatting with AI agents in real-time sandboxes.

## Features

- 🤖 AI-powered code generation with K2 Think V2 agents
- 💻 Real-time Next.js application development in E2B sandboxes
- 🔄 Live preview and code editing with split-pane interface
- 📁 File explorer with syntax highlighting and code themes
- 💬 Conversational project development with message history
- 🎯 Smart usage tracking and rate limiting
- 💳 Subscription management with pro features
- 🔐 Authentication with Clerk
- 📱 Mobile responsive design
- ⚙️ Background job processing with Inngest
- 🗃️ Project management and persistence

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS v4
- Shadcn/ui
- tRPC
- Prisma ORM
- PostgreSQL
- K2 Think V2 (MBZUAI)
- E2B Code Interpreter
- Clerk Authentication
- Inngest
- Prisma
- Radix UI
- Lucide React

## Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Copy .env.example to .env as well (Prisma reads .env)
cp .env.example .env
# Fill in your API keys (Clerk, K2 Think, E2B required for full functionality)

# Start PostgreSQL (Docker)
docker compose up -d

# Start Inngest Dev Server (optional - for background jobs)
# Option A: Via Docker (runs with postgres)
docker compose up -d
# Option B: Via npx (in a separate terminal)
npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:3000/api/inngest

# Set up database
npx prisma migrate dev --name init

# Start development server
npm run dev
```

**Inngest Dashboard:** When running locally, open http://localhost:8288 to view functions, send test events, and inspect runs.

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Database
DATABASE_URL="your-postgres-connection-string"

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="your-clerk-publishable-key"
CLERK_SECRET_KEY="your-clerk-secret-key"

# AI (K2 Think V2 - MBZUAI)
K2_THINK_API_KEY="your-k2-think-api-key"

# Sandbox (E2B)
E2B_API_KEY="your-e2b-api-key"

# Background Jobs (Inngest) - self-hosted locally
INNGEST_DEV=1
INNGEST_BASE_URL="http://localhost:8288"
INNGEST_EVENT_KEY="dev-key"
INNGEST_SIGNING_KEY="dev-signing-key"
```

## Inngest (Self-Hosted / Local)

K2 Vibe uses [Inngest](https://www.inngest.com/) for background jobs (e.g. AI code generation). Inngest is **open source** and can run fully locally—no paid hosted service required.

### Local development

1. **Add to `.env` / `.env.local`:**
   ```
   INNGEST_DEV=1
   INNGEST_BASE_URL="http://localhost:8288"
   INNGEST_EVENT_KEY="dev-key"
   INNGEST_SIGNING_KEY="dev-signing-key"
   ```

2. **Start the Inngest Dev Server** (choose one):
   - **Docker:** `docker compose up -d` (includes Inngest)
   - **npx:** `npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:3000/api/inngest`

3. **Dashboard:** Open http://localhost:8288 to view functions and send test events.

The Dev Server uses dummy keys locally and does not validate them.

### Self-hosted production

For production, run the full Inngest server:

```bash
# Generate secure keys
openssl rand -hex 32  # Use for both event-key and signing-key (or generate two)

# Start Inngest
inngest start --event-key <YOUR_KEY> --signing-key <YOUR_SIGNING_KEY> -u http://your-app-url/api/inngest
```

Set `INNGEST_DEV=0`, `INNGEST_BASE_URL`, `INNGEST_EVENT_KEY`, and `INNGEST_SIGNING_KEY` in your app to match. See [Inngest self-hosting docs](https://www.inngest.com/docs/self-hosting) for Postgres/Redis and Docker Compose examples.

## Additional Commands

```bash
# Database
npm run postinstall        # Generate Prisma client
npx prisma studio          # Open database studio
npx prisma migrate dev     # Migrate schema changes
npx prisma migrate reset   # Reset database (Only for development)

# Build
npm run build          # Build for production
npm run start          # Start production server
npm run lint           # Run ESLint
```

## Project Structure

- `src/app/` - Next.js app router pages and layouts
- `src/components/` - Reusable UI components and file explorer
- `src/modules/` - Feature-specific modules (projects, messages, usage)
- `src/inngest/` - Background job functions and AI agent logic
- `src/lib/` - Utilities and database client
- `src/trpc/` - tRPC router and client setup
- `prisma/` - Database schema and migrations
- `sandbox-templates/` - E2B sandbox configuration

## How It Works

1. **Project Creation**: Users create projects and describe what they want to build
2. **AI Processing**: Messages are sent to GPT-4 agents via Inngest background jobs
3. **Code Generation**: AI agents use E2B sandboxes to generate and test Next.js applications
4. **Real-time Updates**: Generated code and previews are displayed in split-pane interface
5. **File Management**: Users can browse generated files with syntax highlighting
6. **Iteration**: Conversational development allows for refinements and additions

---

Created by [CodeWithAntonio](https://codewithantonio.com)
