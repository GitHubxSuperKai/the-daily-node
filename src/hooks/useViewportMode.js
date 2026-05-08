// useViewportMode — returns 'mobile' | 'desktop' based on viewport width
// Breakpoint: ≤600px is mobile. Updates on window resize.
function useViewportMode(breakpoint) {
  breakpoint = breakpoint || 600;
  const [mode, setMode] = React.useState(
    typeof window !== 'undefined' && window.innerWidth <= breakpoint ? 'mobile' : 'desktop'
  );
  React.useEffect(function() {
    function onResize() {
      setMode(window.innerWidth <= breakpoint ? 'mobile' : 'desktop');
    }
    window.addEventListener('resize', onResize);
    return function() { window.removeEventListener('resize', onResize); };
  }, [breakpoint]);
  return mode;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { useViewportMode };
}
