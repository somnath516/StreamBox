(function () {
  const readyIcons = [
    { sizes: '128x128', href: '/logos/icon-192.png' },
    { sizes: '256x256', href: '/logos/icon-512.png' }
  ];

  function setReadyFavicon() {
    const stamp = 'v=20260513';
    readyIcons.forEach(icon => {
      let link = document.querySelector(`link[rel="icon"][sizes="${icon.sizes}"]`);
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.sizes = icon.sizes;
        document.head.appendChild(link);
      }
      link.href = `${icon.href}?${stamp}`;
    });
  }

  if (document.readyState === 'complete') {
    requestAnimationFrame(setReadyFavicon);
  } else {
    window.addEventListener('load', () => requestAnimationFrame(setReadyFavicon), { once: true });
  }
})();
