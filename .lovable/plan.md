
## Goal

Stop the persistent blank-page/error-screen navigation bug by removing the unstable homepage globe as a route-blocking failure point and making route transitions resilient even if that widget fails.

## Exact problem

The issue is still the same `renderObjs._destructor is not a function` crash from the homepage `react-globe.gl` widget during unmount. That error happens while leaving `/`, so when the user navigates to pages like `/insights`, the outgoing homepage globe crashes during cleanup and the app falls into the full-page error state until a refresh.

The current patch is not sufficient because:
- the real failing cleanup path is still being reached inside the globe library
- the homepage still mounts the globe by default
- `src/App.tsx` still wraps the whole router in a root `ErrorBoundary`, so a route-transition failure can still replace the entire app with the error screen

## Implementation plan

### 1. Remove the router-wide full-page failure mode
Update `src/App.tsx` so the whole `<Routes>` tree is no longer wrapped in the root page-level `ErrorBoundary`.

Result:
- a single marketing-page widget failure will not blank the whole app
- route/layout-level boundaries remain responsible for localized fallback UI

### 2. Make the homepage safe by default
Update `src/components/home/DemoSection.tsx` so the default view is `map`, not `globe`.

Result:
- normal visitors can still access the 3D globe manually
- simple navigation from the homepage no longer immediately unmounts the unstable globe for every user
- Paddle/compliance reviewers and locked-down browsers will see a fully working page without touching WebGL

### 3. Gate globe mounting behind explicit user intent
Refine `src/components/home/DemoSection.tsx` so the `DemoGlobe` is mounted only after the user explicitly switches to Globe view.

Add a small note beside the toggle such as “3D view may be limited on some browsers” if needed.

Result:
- the unstable dependency becomes optional instead of part of the default route lifecycle
- most users never hit the crash path during routine navigation

### 4. Harden `DemoGlobe` teardown instead of only patching on ready
Refactor `src/components/home/DemoGlobe.tsx` to make cleanup defensive in a more reliable place:
- keep WebGL detection
- add explicit unmount cleanup around the globe ref
- safely pause/dispose renderer/controls if available
- guard every internal cleanup access before calling nested destructor paths
- avoid assuming a single internal shape like `state.renderObjs`

If the component still cannot be made stable without depending on undocumented internals, stop rendering `react-globe.gl` entirely and swap the globe tab to a styled static/2D fallback using the existing `HeroMap`.

### 5. Localize any remaining widget failures
Keep the `silent` boundary around `DemoGlobe` in `src/components/home/DemoSection.tsx`, and keep the inline boundary in `src/layouts/MarketingLayout.tsx`.

This ensures:
- optional visualization errors stay inside the visualization box
- marketing pages continue rendering normally

### 6. Clean up the temporary global suppression
Review `src/main.tsx` after the structural fix:
- either remove the global `_destructor` suppression completely
- or keep it narrowly scoped as a last-resort safeguard only if still needed

The preferred outcome is to fix the lifecycle so the app does not rely on swallowing global errors.

## Files to edit

- `src/App.tsx`
- `src/components/home/DemoSection.tsx`
- `src/components/home/DemoGlobe.tsx`
- `src/main.tsx`

## Expected outcome

After these changes:
- navigating from `/` to `/insights` should no longer produce a blank page
- refresh should no longer be required to recover
- the homepage remains fully usable for reviewers and normal users
- the 3D globe becomes optional instead of breaking route transitions

## Verification after implementation

1. Open `/`
2. Navigate repeatedly to `/insights`, `/pricing`, `/about`, and back home
3. Confirm no full-page error screen appears
4. Confirm hard refresh is no longer required
5. Confirm homepage still works when Globe is never opened
6. If Globe is still exposed, toggle to Globe and navigate away/back several times to verify stability
