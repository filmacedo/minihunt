# Vercel Deployment Setup

This is a Turborepo monorepo. For Vercel to deploy correctly, you need to configure the Root Directory setting.

## Required Vercel Configuration

1. Go to your Vercel project settings
2. Navigate to **Settings** → **General**
3. Find the **Root Directory** field
4. Set it to `.` (the repository root) - **NOT** `apps/web`

## Why?

Vercel needs to:
- Run `pnpm install` from the repo root (where `package.json` and `pnpm-workspace.yaml` are)
- Run `turbo build --filter=web` to build only the web app

If Root Directory is set to `apps/web`, Vercel will try to go up directories to find `package.json`, which causes the `ERR_PNPM_NO_PKG_MANIFEST` error.

## After Changing Root Directory

Once you update the Root Directory setting:
1. The `vercel.json` in the repo root will be used
2. Dependencies will install correctly from the monorepo root
3. The build will filter to only the `web` app using Turborepo

