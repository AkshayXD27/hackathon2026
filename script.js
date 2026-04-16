document.addEventListener("DOMContentLoaded", () => {
    // 1. Initial Reveal Animations
    const elementsToReveal = [
        document.querySelector('.hero-content h1'),
        document.querySelector('.hero-content p'),
        document.querySelector('.cta-btn'),
        ...document.querySelectorAll('.card')
    ];

    elementsToReveal.forEach((el, index) => {
        if (!el) return;
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.8s cubic-bezier(0.165, 0.84, 0.44, 1) ${index * 0.1}s, 
                               transform 0.8s cubic-bezier(0.165, 0.84, 0.44, 1) ${index * 0.1}s`;
        
        // Trigger reflow
        void el.offsetWidth;
        
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            
            // Clean up transition after animation so hover works properly (for cards)
            if (el.classList.contains('card')) {
                setTimeout(() => {
                    el.style.transition = '';
                }, 800 + index * 100);
            }
        }, 100);
    });

    // 2. 3D Tilt Effect on Cards
    const cards = document.querySelectorAll('.card');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            // Get dimensions and position of the card
            const rect = card.getBoundingClientRect();
            
            // Calculate mouse position relative to the center of the card
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Calculate rotation amount (max 15 degrees)
            const rotateX = ((y - centerY) / centerY) * -15;
            const rotateY = ((x - centerX) / centerX) * 15;

            // Apply transformation
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-12px) scale(1.05)`;
            card.style.transition = `transform 0.1s ease`;
            card.style.zIndex = '20';
            card.style.boxShadow = `0 30px 60px rgba(0,0,0,0.12), ${-rotateY}px ${rotateX}px 20px rgba(250, 140, 53, 0.1)`;
        });

        card.addEventListener('mouseleave', () => {
            // Reset to default on mouse out
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px) scale(1)`;
            card.style.transition = `transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.5s ease`;
            card.style.zIndex = '3';
            card.style.boxShadow = `0 20px 45px rgba(0,0,0,0.08)`;
            
            // reset custom original zIndex for birthday card
            if (card.classList.contains('card-birthday')) {
                card.style.zIndex = '1';
            }
        });
    });
});
