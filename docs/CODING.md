## ARCHITECTURE

### Data Flow (Modular Separation)

```
External APIs → Services → API Routes → Hooks → Components
                    ↓          ↓          ↓
                 Server     Server    Client/Server
```

**Critical Rule**: Client code never imports server services directly

### Layer Responsibilities

**1. Services** (`packages/data/services/`)
- Shared business logic, external API calls
- Server-side only (Node.js SDKs, secrets)
- Reusable across all apps

**2. API Routes** (`apps/*/app/api/`)
- Expose services to client
- Authentication, validation, error handling
- Import from `@talent/data/services/`

**3. Hooks** (`packages/ui/src/hooks/`)
- Smart server/client detection
- **Minimum interface**: `{data, loading, error}` (extend with `refetch`, `mutate`, etc.)
- Data fetching, caching, state management

**4. Components**
- Pure UI receiving data via props
- No API calls or service imports
- Use hooks for data needs

### Client-Server Separation Pattern

```tsx
// ❌ PROHIBITED: Client importing service
import { fetchProfile } from '@talent/data/services/talent'

// ✅ REQUIRED: Hook with smart detection
export function useProfile(userId: string) {
  return useQuery({
    queryFn: async () => {
      if (isServer) {
        return fetchProfile({ talentId: userId })      // SSR: direct call
      }
      const res = await axios.get(`/api/profile?id=${userId}`) // Client: API route
      return res.data
    }
  })
}
```

**Why**: Security (secrets stay server-side), bundle size (no Node.js SDKs in client), type safety