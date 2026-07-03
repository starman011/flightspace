import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CommandCenterOverlay from './CommandCenterOverlay'

// The overlay must NEVER hide via display:none — toggling display restarts
// every CSS animation inside it (feedSlideIn on .stream), which makes the
// collapsed Space Feed slide fully open each time the overlay reappears
// (e.g. after closing an aircraft DetailPanel). visibility:hidden does not
// restart animations.

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })))

const noop = () => {}
const baseProps = {
  trackedCount: 0,
  connectionStatus: 'connected',
  issData: null,
  onISSLink: { flyTo: noop, selectISS: noop, trackISS: noop },
  pinnedLaunch: null,
  onUnpinLaunch: noop,
  forceCollapsed: false,
  activeFilter: null,
  onFiltersChange: noop,
  onCameraScale: noop,
  onActiveFilterChange: noop,
  onLaunchPanelToggle: noop,
  zoomedIn: false,
  activeScale: 'earth',
  onDistanceChange: noop,
  liveEnabled: true,
  onLiveToggle: noop,
  onSearchOpen: noop,
  audioMuted: false,
  onAudioToggle: noop,
}

describe('CommandCenterOverlay hidden prop', () => {
  beforeEach(() => sessionStorage.clear())

  it('hides via visibility, not display:none (display toggle restarts feedSlideIn)', () => {
    const { container } = render(<CommandCenterOverlay {...baseProps} hidden />)
    const root = container.firstChild
    expect(root.style.display).not.toBe('none')
    expect(root.style.visibility).toBe('hidden')
  })

  it('is fully visible when hidden=false', () => {
    const { container } = render(<CommandCenterOverlay {...baseProps} hidden={false} />)
    const root = container.firstChild
    expect(root.style.display).not.toBe('none')
    expect(root.style.visibility).not.toBe('hidden')
  })
})
