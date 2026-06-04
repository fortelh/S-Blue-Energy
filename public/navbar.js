document.write(`
    <nav class="bg-white shadow-md sticky top-0 z-50">
        <div class="container mx-auto px-6 py-4 flex justify-between items-center">
            <a href="/">
                <img id="site-logo" src="" alt="S-Blue Energy" class="h-12 w-auto">
            </a>
            <div class="hidden md:flex space-x-8 font-bold text-blue-900">
                <a href="/" class="hover:text-blue-500 transition">Home</a>
                <a href="/services" class="hover:text-blue-500 transition">Services</a>
                <a href="/projects" class="hover:text-blue-500 transition">Our Projects</a>
                <a href="/about" class="hover:text-blue-500 transition">About Us</a>
                <a href="/contact" class="hover:text-blue-500 transition">Contact Us</a>
            </div>
            <a href="/admin.html" class="text-xs text-gray-400 hover:text-blue-500">Admin</a>
        </div>
    </nav>
`);

// Automatically populate logo across all pages
fetch('/api/settings/logo')
    .then(res => res.json())
    .then(data => {
        if(data && data.value) {
            const logoImg = document.getElementById('site-logo');
            if(logoImg) logoImg.src = data.value;
        }
    });