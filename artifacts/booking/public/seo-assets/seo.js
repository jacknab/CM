document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('nav-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (!toggle.contains(e.target) && !links.contains(e.target)) {
        links.classList.remove('open');
      }
    });
  }

  var faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(function (item) {
    var btn = item.querySelector('.faq-q');
    if (btn) {
      btn.addEventListener('click', function () {
        var isOpen = item.classList.contains('open');
        faqItems.forEach(function (i) { i.classList.remove('open'); });
        if (!isOpen) item.classList.add('open');
      });
    }
  });

  var prev = document.getElementById('cards-prev');
  var next = document.getElementById('cards-next');
  var carousel = document.getElementById('biz-cards');
  if (prev && next && carousel) {
    prev.addEventListener('click', function () { carousel.scrollBy({ left: -580, behavior: 'smooth' }); });
    next.addEventListener('click', function () { carousel.scrollBy({ left: 580, behavior: 'smooth' }); });
  }
});
