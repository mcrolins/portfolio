// ===== Scroll-triggered fade-in animations =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

  // Highlight active nav link
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-dark-custom .nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === path) {
      link.classList.add('active');
    }
  });

  // Navbar background on scroll
  const nav = document.querySelector('.navbar-dark-custom');
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        nav.style.background = 'rgba(10,10,26,0.95)';
      } else {
        nav.style.background = 'rgba(10,10,26,0.85)';
      }
    });
  }
});
