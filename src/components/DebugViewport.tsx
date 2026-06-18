import { useEffect, useState } from 'react';

// TEMPORARY diagnostic overlay. Prints the raw viewport metrics iOS reports plus
// the actual rendered geometry of the shell and tab bar, so we can see exactly
// why a gap appears below the tab bar. Remove once the layout bug is fixed.
function measure() {
  const probe = (h: string) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;visibility:hidden;height:${h};`;
    document.body.appendChild(el);
    const v = el.getBoundingClientRect().height;
    el.remove();
    return Math.round(v);
  };

  const app = document.querySelector('.app') as HTMLElement | null;
  const tabbar = document.querySelector('.tabbar') as HTMLElement | null;
  const appRect = app?.getBoundingClientRect();
  const tabRect = tabbar?.getBoundingClientRect();

  return {
    innerH: window.innerHeight,
    screenH: window.screen.height,
    docClientH: document.documentElement.clientHeight,
    vvH: window.visualViewport ? Math.round(window.visualViewport.height) : -1,
    vvOffTop: window.visualViewport ? Math.round(window.visualViewport.offsetTop) : -1,
    dvh: probe('100dvh'),
    vh: probe('100vh'),
    svh: probe('100svh'),
    lvh: probe('100lvh'),
    safeBottom: probe('env(safe-area-inset-bottom)'),
    safeTop: probe('env(safe-area-inset-top)'),
    appH: appRect ? Math.round(appRect.height) : -1,
    appBottom: appRect ? Math.round(appRect.bottom) : -1,
    tabBottom: tabRect ? Math.round(tabRect.bottom) : -1,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    // @ts-expect-error iOS-only legacy flag
    navStandalone: !!window.navigator.standalone,
    dpr: window.devicePixelRatio,
  };
}

export default function DebugViewport() {
  const [m, setM] = useState(measure);

  useEffect(() => {
    const update = () => setM(measure());
    update();
    const t = setTimeout(update, 500); // re-measure after layout settles
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  const gap = m.screenH - m.tabBottom;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.85)',
        color: '#0f0',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        padding: '6px 8px',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      }}
    >
      {`standalone=${m.standalone} navStandalone=${m.navStandalone} dpr=${m.dpr}
screenH=${m.screenH}  innerH=${m.innerH}  docClientH=${m.docClientH}
vvH=${m.vvH} vvOffTop=${m.vvOffTop}
dvh=${m.dvh} vh=${m.vh} svh=${m.svh} lvh=${m.lvh}
safeTop=${m.safeTop} safeBottom=${m.safeBottom}
appH=${m.appH} appBottom=${m.appBottom} tabBottom=${m.tabBottom}
screenH - tabBottom = ${gap}`}
    </div>
  );
}
