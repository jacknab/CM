<?php
session_start();
require_once __DIR__ . '/config.php';

// Mark session as authenticated so all action files work correctly
// Flash messages from redirects
$flash = $_SESSION['flash'] ?? null;
unset($_SESSION['flash']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Launchit Admin — Upload Template</title>
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/admin.css">
</head>
<body class="admin-body">

<header class="admin-header">
    <a class="admin-header__brand" href="<?php echo BASE_PATH; ?>/admin.php">
        <div class="admin-header__logo">🚀</div>
        Launchit Admin
        <span class="admin-header__tag">Certxa</span>
    </a>
    <div class="admin-header__actions">
        <a href="<?php echo BASE_PATH; ?>/admin-catalog.php" class="btn-admin btn-admin--ghost btn-admin--sm">
            🗂 Manage Templates →
        </a>
    </div>
</header>

<div class="admin-layout" style="max-width:740px;">

    <div class="admin-page-title">Upload React/Vite Template</div>
    <div class="admin-page-sub">
        Drop your zipped React/Vite project and select a category — everything else is detected automatically.
    </div>

    <?php if ($flash): ?>
    <div class="flash-msg flash-msg--<?php echo htmlspecialchars($flash['type']); ?>" id="flashMsg">
        <span class="flash-msg__icon"><?php echo $flash['type'] === 'success' ? '✅' : '❌'; ?></span>
        <span><?php echo htmlspecialchars($flash['msg']); ?></span>
        <button class="flash-msg__close" onclick="this.parentElement.remove()">✕</button>
    </div>
    <?php endif; ?>

    <div class="admin-card" style="margin-top:28px;">
        <div class="admin-card__body" style="padding:32px;">

            <form id="uploadForm" method="POST"
                  action="<?php echo BASE_PATH; ?>/admin-install.php"
                  enctype="multipart/form-data"
                  onsubmit="return confirmInstall()">

                <!-- Drop zone -->
                <div class="upload-drop" id="dropZone" onclick="document.getElementById('zipFile').click()">
                    <div class="upload-drop__icon">📦</div>
                    <div class="upload-drop__title" id="dropTitle">Drop your ZIP file here, or click to browse</div>
                    <div class="upload-drop__sub">React/Vite project ZIP · up to 50 MB</div>
                    <div class="upload-drop__filename" id="fileNameDisplay" style="display:none;"></div>
                    <input type="file" name="zipfile" id="zipFile" accept=".zip" required>
                </div>

                <!-- Category -->
                <div class="form-group" style="margin-top:28px;">
                    <label class="form-label" style="font-size:0.9rem;margin-bottom:8px;display:block;">
                        Category <span style="color:rgba(248,113,113,0.8);">*</span>
                    </label>
                    <select name="category" id="fCategory" class="form-select" required
                            style="max-width:320px;">
                        <option value="">— Select category —</option>
                        <option value="Hair Salon">Hair Salon</option>
                        <option value="Barbershop">Barbershop</option>
                        <option value="Nail Salon">Nail Salon</option>
                    </select>
                    <span class="form-hint" style="display:block;margin-top:6px;">
                        Name, colors, and hero text are read automatically from your source files.
                    </span>
                </div>

                <div class="form-actions" style="margin-top:32px;">
                    <button type="submit" class="btn-admin btn-admin--orange" id="installBtn"
                            style="font-size:1rem;padding:12px 32px;">
                        🚀 Install Template
                    </button>
                    <span style="color:rgba(255,255,255,0.3);font-size:0.8rem;align-self:center;">
                        Installs dependencies, builds, registers in catalog &amp; generates thumbnail — ~30–90 s
                    </span>
                </div>

            </form>
        </div>
    </div>

</div>

<script>
const dropZone        = document.getElementById('dropZone');
const zipFile         = document.getElementById('zipFile');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const dropTitle       = document.getElementById('dropTitle');

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        zipFile.files = dt.files;
        onFileSelected(file);
    } else if (file) {
        alert('Please drop a .zip file.');
    }
});
zipFile.addEventListener('change', () => {
    if (zipFile.files[0]) onFileSelected(zipFile.files[0]);
});

function onFileSelected(file) {
    fileNameDisplay.textContent = '📦 ' + file.name;
    fileNameDisplay.style.display = 'block';
    dropTitle.textContent = 'File ready — select a category and click Install';
    dropZone.style.borderColor = 'rgba(52,211,153,0.5)';
}

function confirmInstall() {
    if (!zipFile.files[0]) {
        alert('Please select a ZIP file.');
        return false;
    }
    if (!document.getElementById('fCategory').value) {
        alert('Please select a category.');
        return false;
    }
    const btn = document.getElementById('installBtn');
    btn.innerHTML = '<span class="spinner"></span> Installing… (this takes ~60 s)';
    btn.disabled = true;
    return true;
}
</script>

</body>
</html>
