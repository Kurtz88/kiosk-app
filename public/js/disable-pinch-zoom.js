/**
 * Discourage page zoom (pinch / Ctrl+wheel / browser zoom shortcuts).
 * Kiosk: keep layout fixed; scrolling still works (single-finger / wheel).
 */
(function () {
    'use strict';

    function onWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }

    function onGesture(e) {
        e.preventDefault();
    }

    function onKeyDown(e) {
        if (!e.ctrlKey && !e.metaKey) return;
        var k = e.key;
        var c = e.code;
        if (
            k === '+' ||
            k === '-' ||
            k === '=' ||
            k === '0' ||
            k === '_' ||
            c === 'Equal' ||
            c === 'Minus' ||
            c === 'Digit0' ||
            c === 'NumpadAdd' ||
            c === 'NumpadSubtract'
        ) {
            e.preventDefault();
        }
    }

    function onTouchMove(e) {
        if (e.touches && e.touches.length > 1) {
            e.preventDefault();
        }
    }

    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    try {
        document.addEventListener('gesturestart', onGesture, { passive: false });
        document.addEventListener('gesturechange', onGesture, { passive: false });
        document.addEventListener('gestureend', onGesture, { passive: false });
    } catch (_) {
        /* non-WebKit */
    }
})();
