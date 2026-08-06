<?php
session_start();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/data/templates.php';

// Ensure session is authenticated
// Flash messages from redirects
$flash = $_SESSION['flash'] ?? null;
unset($_SESSION['flash']);

// Stats
$hair_count  = count(array_filter($all_templates, fn($t) => $t['category'] === 'Hair Salon'));
$barb_count  = count(array_filter($all_templates, fn($t) => $t['category'] === 'Barbershop'));
$nail_count  = count(array_filter($all_templates, fn($t) => $t['category'] === 'Nail Salon'));
$total_count = count($all_templates);
$thumbs_dir  = __DIR__ . '/assets/img/thumbs';

// ── Auto-cleanup scraped-tmp/ (runs silently at most once per hour) ────────────
$_sc_tmp_base    = __DIR__ . '/scraped-tmp';
$_sc_flag        = $_sc_tmp_base . '/.last-cleanup';
$_sc_last_run    = file_exists($_sc_flag) ? (int) strtotime(trim(file_get_contents($_sc_flag))) : 0;
if (is_dir($_sc_tmp_base) && (time() - $_sc_last_run) > 3600) {
    foreach (scandir($_sc_tmp_base) as $_sc_entry) {
        if ($_sc_entry === '.' || $_sc_entry === '..' || str_starts_with($_sc_entry, '.')) continue;
        $_sc_path = $_sc_tmp_base . '/' . $_sc_entry;
        if (!is_dir($_sc_path)) continue;
        $_sc_age  = time() - (int) filemtime($_sc_path);
        $_sc_mf   = $_sc_path . '/meta.json';
        if (file_exists($_sc_mf)) {
            $_sc_meta = @json_decode(file_get_contents($_sc_mf), true);
            if (!empty($_sc_meta['scraped_at'])) {
                $_sc_ts = strtotime($_sc_meta['scraped_at']);
                if ($_sc_ts) $_sc_age = time() - $_sc_ts;
            }
        }
        if ($_sc_age >= 86400) {
            try {
                $_sc_iter = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($_sc_path, FilesystemIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST
                );
                foreach ($_sc_iter as $_sc_f) {
                    $_sc_f->isDir() ? @rmdir($_sc_f->getPathname()) : @unlink($_sc_f->getPathname());
                }
            } catch (Exception $_e) {}
            @rmdir($_sc_path);
        }
    }
    @file_put_contents($_sc_flag, date('c'));
}
unset($_sc_tmp_base, $_sc_flag, $_sc_last_run, $_sc_entry, $_sc_path, $_sc_age, $_sc_mf, $_sc_meta, $_sc_ts, $_sc_iter, $_sc_f, $_e);

// Count remaining active tmp sessions (for UI display)
$_tmp_dir      = __DIR__ . '/scraped-tmp';
$_tmp_sessions = 0;
$_tmp_bytes    = 0;
if (is_dir($_tmp_dir)) {
    foreach (scandir($_tmp_dir) as $_te) {
        if ($_te === '.' || $_te === '..' || str_starts_with($_te, '.')) continue;
        if (is_dir($_tmp_dir . '/' . $_te)) {
            $_tmp_sessions++;
            try {
                $_tdi = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($_tmp_dir . '/' . $_te, FilesystemIterator::SKIP_DOTS)
                );
                foreach ($_tdi as $_tf) if ($_tf->isFile()) $_tmp_bytes += $_tf->getSize();
            } catch (Exception $_e2) {}
        }
    }
}
unset($_tmp_dir, $_te, $_tdi, $_tf, $_e2);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Launchit Admin — Template Catalog</title>
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/admin.css">
</head>
<body class="admin-body">

<header class="admin-header">
    <a class="admin-header__brand" href="<?php echo BASE_PATH; ?>/admin-catalog.php">
        <div class="admin-header__logo">🚀</div>
        Launchit Admin
        <span class="admin-header__tag">Certxa</span>
    </a>
    <div class="admin-header__actions">
        <span class="admin-header__user">Catalog Manager</span>
        <button class="btn-admin btn-admin--ghost btn-admin--sm" onclick="openMediaLibModal()">🖼️ Image Library</button>
        <a href="<?php echo BASE_PATH; ?>/" target="_blank" class="admin-logout">View Catalog ↗</a>
        <a href="<?php echo BASE_PATH; ?>/admin.php" class="btn-admin btn-admin--orange btn-admin--sm">+ Upload Template</a>
    </div>
</header>

<div class="admin-layout">
    <div class="admin-page-title">Template Catalog</div>
    <div class="admin-page-sub">Manage, preview, edit, and organise all salon website templates.</div>

    <!-- Stats -->
    <div class="admin-stats">
        <div class="admin-stat admin-stat--purple">
            <div class="admin-stat__num"><?php echo $total_count; ?></div>
            <div class="admin-stat__label">Total Templates</div>
        </div>
        <div class="admin-stat">
            <div class="admin-stat__num"><?php echo $hair_count; ?></div>
            <div class="admin-stat__label">Hair Salons</div>
        </div>
        <div class="admin-stat">
            <div class="admin-stat__num"><?php echo $barb_count; ?></div>
            <div class="admin-stat__label">Barbershops</div>
        </div>
        <div class="admin-stat admin-stat--green">
            <div class="admin-stat__num"><?php echo $nail_count; ?></div>
            <div class="admin-stat__label">Nail Salons</div>
        </div>
    </div>

    <?php if ($flash): ?>
    <div class="flash-msg flash-msg--<?php echo htmlspecialchars($flash['type']); ?>" id="flashMsg">
        <span class="flash-msg__icon"><?php echo $flash['type'] === 'success' ? '✅' : '❌'; ?></span>
        <span><?php echo htmlspecialchars($flash['msg']); ?></span>
        <button class="flash-msg__close" onclick="this.parentElement.remove()">✕</button>
    </div>
    <?php endif; ?>

    <!-- Template List -->
    <div class="admin-card">
        <div class="admin-card__header">
            <span class="admin-card__title">All Templates</span>
            <div style="display:flex;gap:8px;align-items:center;">
                <a href="#scraper" class="btn-admin btn-admin--primary btn-admin--sm">🌐 Import from URL</a>
                <form method="POST" action="<?php echo BASE_PATH; ?>/admin-regen-all-thumbs.php" style="display:inline;"
                      onsubmit="return confirm('Regenerate thumbnails for all React templates? This may take several minutes.')">
                    <input type="hidden" name="filter" value="react">
                    <button type="submit" class="btn-admin btn-admin--ghost btn-admin--sm">🖼️ Regen All Thumbs</button>
                </form>
                <a href="<?php echo BASE_PATH; ?>/admin.php" class="btn-admin btn-admin--orange btn-admin--sm">+ Upload New</a>
            </div>
        </div>
        <div class="admin-card__body" style="padding:0;">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Template</th>
                        <th>ID</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Source URL</th>
                        <th>Thumbnail</th>
                        <th>Hours</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($all_templates as $id => $t):
                        $thumb_ok = file_exists($thumbs_dir . '/' . $id . '.jpg');
                        $type     = $t['type'] ?? 'php';
                    ?>
                    <tr>
                        <td class="tbl-name" data-id="<?php echo htmlspecialchars($id); ?>">
                            <span class="tpl-name-text"><?php echo htmlspecialchars($t['name']); ?></span>
                            <button class="tpl-name-edit-btn" title="Rename">✎</button>
                            <span class="tpl-name-editing" style="display:none;">
                                <input type="text" class="tpl-name-input"
                                       value="<?php echo htmlspecialchars($t['name']); ?>">
                                <button class="tpl-name-save" title="Save">✓</button>
                                <button class="tpl-name-cancel" title="Cancel">✕</button>
                            </span>
                        </td>
                        <td class="tbl-id"><?php echo htmlspecialchars($id); ?></td>
                        <td class="tbl-cat"><?php echo htmlspecialchars($t['category']); ?></td>
                        <td>
                            <span class="tbl-badge tbl-badge--<?php echo $type; ?>">
                                <?php echo strtoupper($type); ?>
                            </span>
                        </td>
                        <td class="tbl-source">
                            <?php if ($type === 'scraped' && !empty($t['source_url'])): ?>
                            <a href="<?php echo htmlspecialchars($t['source_url']); ?>"
                               target="_blank" rel="noopener"
                               class="tbl-source-link"
                               title="<?php echo htmlspecialchars($t['source_url']); ?>">
                                <?php
                                $parsed  = parse_url($t['source_url']);
                                $display = ($parsed['host'] ?? '') . (isset($parsed['path']) && $parsed['path'] !== '/' ? rtrim($parsed['path'], '/') : '');
                                echo htmlspecialchars($display ?: $t['source_url']);
                                ?>
                                <span class="tbl-source-arrow">↗</span>
                            </a>
                            <?php else: ?>
                            <span class="tbl-source-empty">—</span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="thumb-dot thumb-dot--<?php echo $thumb_ok ? 'ok' : 'missing'; ?>"></span>
                            <?php echo $thumb_ok ? 'OK' : 'Missing'; ?>
                        </td>
                        <td class="tbl-hours">
                            <?php
                            $hrs = $t['hours'] ?? null;
                            if ($hrs):
                                echo '<span class="hours-compact">' . htmlspecialchars($hrs) . '</span>';
                            else: ?>
                            <span class="hours-compact">Mon–Fri 9am–6pm<br>Sat 10am–4pm<br>Sun Closed</span>
                            <?php endif; ?>
                        </td>
                        <td class="tbl-actions">
                            <a href="<?php echo BASE_PATH; ?>/preview.php?id=<?php echo urlencode($id); ?>"
                               target="_blank" class="tbl-link">Preview ↗</a>
                            <?php if ($type === 'react'): ?>
                            <button class="tbl-link tbl-link--replace btn-replace"
                                    data-id="<?php echo htmlspecialchars($id); ?>"
                                    data-name="<?php echo htmlspecialchars($t['name']); ?>">
                                Replace
                            </button>
                            <?php $has_source = is_dir(dirname(__DIR__) . '/artifacts/template-' . $id); ?>
                            <?php if ($has_source): ?>
                            <form method="POST" action="<?php echo BASE_PATH; ?>/admin-detect.php" style="display:inline;">
                                <input type="hidden" name="template_id" value="<?php echo htmlspecialchars($id); ?>">
                                <button type="submit" class="tbl-link tbl-link--sync"
                                        title="Re-scan source code and update name, colors, hero text &amp; thumbnail">
                                    Re-sync
                                </button>
                            </form>
                            <?php endif; ?>
                            <?php endif; ?>
                            <?php if ($type === 'scraped'): ?>
                            <button class="tbl-link tbl-link--rescrape btn-rescrape"
                                    data-id="<?php echo htmlspecialchars($id); ?>"
                                    data-name="<?php echo htmlspecialchars($t['name']); ?>"
                                    data-src="<?php echo htmlspecialchars($t['source_url'] ?? ''); ?>"
                                    title="Re-fetch the original URL and refresh all downloaded assets">
                                Re-scrape
                            </button>
                            <?php endif; ?>
                            <form method="POST" action="<?php echo BASE_PATH; ?>/admin-thumb.php" style="display:inline;">
                                <input type="hidden" name="template_id" value="<?php echo htmlspecialchars($id); ?>">
                                <button type="submit" class="tbl-link tbl-link--regen">Regen Thumb</button>
                            </form>
                            <button class="tbl-link tbl-link--upload btn-upload-thumb"
                                    data-id="<?php echo htmlspecialchars($id); ?>"
                                    data-name="<?php echo htmlspecialchars($t['name']); ?>">
                                Upload Image
                            </button>
                            <button class="tbl-link tbl-link--dupe btn-duplicate"
                                    data-id="<?php echo htmlspecialchars($id); ?>"
                                    data-name="<?php echo htmlspecialchars($t['name']); ?>"
                                    data-type="<?php echo htmlspecialchars($type); ?>"
                                    data-category="<?php echo htmlspecialchars($t['category']); ?>">
                                Duplicate
                            </button>
                            <button class="tbl-link tbl-link--edit btn-edit"
                                    data-id="<?php echo htmlspecialchars($id); ?>">
                                Edit
                            </button>
                            <button class="tbl-link tbl-link--delete btn-delete"
                                    data-id="<?php echo htmlspecialchars($id); ?>"
                                    data-name="<?php echo htmlspecialchars($t['name']); ?>"
                                    data-type="<?php echo htmlspecialchars($type); ?>">
                                Delete
                            </button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Delete Modal -->
    <div id="deleteModal" class="modal-backdrop" style="display:none;">
        <div class="modal-box">
            <div class="modal-header">
                <div class="modal-title">Delete Template</div>
                <button class="modal-close" onclick="closeDeleteModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="modal-template-info modal-template-info--danger" id="deleteTemplateName"></div>
                <p class="modal-desc" style="color:rgba(248,113,113,0.8);">
                    This will permanently remove the template from the catalog and delete all associated files.
                    This cannot be undone.
                </p>
                <div id="deleteReactNote" class="modal-delete-note" style="display:none;">
                    The following will be deleted:
                    <ul class="modal-delete-list">
                        <li>Catalog registration in the database</li>
                        <li>Built site files in <code>launchsite/templates/{id}/</code></li>
                        <li>Source files in <code>artifacts/template-{id}/</code></li>
                        <li>Thumbnail image</li>
                    </ul>
                </div>
                <div id="deletePhpNote" class="modal-delete-note" style="display:none;">
                    The following will be deleted:
                    <ul class="modal-delete-list">
                        <li>Catalog registration in the database</li>
                        <li>Thumbnail image</li>
                    </ul>
                    <p style="margin-top:8px;color:rgba(255,255,255,0.3);font-size:0.75rem;">
                        PHP template files are not deleted — remove them manually if needed.
                    </p>
                </div>
                <form id="deleteForm" method="POST" action="<?php echo BASE_PATH; ?>/admin-delete.php"
                      onsubmit="return confirmDelete()">
                    <input type="hidden" name="template_id" id="deleteTemplateId">
                    <div class="form-group" style="margin-top:18px;">
                        <label class="form-label" style="color:rgba(248,113,113,0.7);">
                            Type the template ID to confirm
                        </label>
                        <input type="text" id="deleteConfirmInput" class="form-input form-input--danger"
                               placeholder="e.g. luxury-nails-spa" autocomplete="off" spellcheck="false">
                        <span class="form-hint" id="deleteConfirmHint"></span>
                    </div>
                    <div class="modal-actions" style="margin-top:20px;">
                        <button type="submit" class="btn-admin btn-admin--danger" id="deleteBtn" disabled>
                            🗑️ Delete Permanently
                        </button>
                        <button type="button" class="btn-admin btn-admin--ghost" onclick="closeDeleteModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Image Library Modal -->
    <div id="mediaLibModal" class="modal-backdrop" style="display:none;">
        <div class="modal-box modal-box--media">
            <div class="modal-header">
                <div class="modal-title">🖼️ Image Library</div>
                <button class="modal-close" onclick="closeMediaLibModal()">✕</button>
            </div>
            <div class="modal-body modal-body--media" id="mediaLibContent">
                <div class="media-lib-loading">Loading…</div>
            </div>
        </div>
    </div>

    <!-- Edit Template Modal -->
    <div id="editModal" class="modal-backdrop" style="display:none;">
        <div class="modal-box modal-box--wide">
            <div class="modal-header">
                <div class="modal-title">Edit Template Entry</div>
                <button class="modal-close" onclick="closeEditModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="modal-template-info" id="editTemplateName"></div>
                <form id="editForm" method="POST"
                      action="<?php echo BASE_PATH; ?>/admin-edit.php"
                      onsubmit="return confirmEdit()">
                    <input type="hidden" name="template_id" id="editTemplateId">
                    <div class="edit-grid">
                        <div class="form-group">
                            <label class="form-label">Display name</label>
                            <input type="text" name="name" id="editName" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Category</label>
                            <select name="category" id="editCategory" class="form-select" required>
                                <option value="Hair Salon">Hair Salon</option>
                                <option value="Barbershop">Barbershop</option>
                                <option value="Nail Salon">Nail Salon</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Style tag</label>
                            <input type="text" name="style" id="editStyle" class="form-input"
                                   placeholder="e.g. Modern, Classic, Luxury">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Badge</label>
                            <select name="badge" id="editBadge" class="form-select">
                                <option value="">— none —</option>
                                <option value="new">new</option>
                                <option value="popular">popular</option>
                                <option value="premium">premium</option>
                            </select>
                        </div>
                        <div class="form-group edit-grid__full">
                            <label class="form-label">Description</label>
                            <textarea name="desc" id="editDesc" class="form-input form-textarea"
                                      rows="3" placeholder="Short catalog card description"></textarea>
                        </div>
                        <div class="form-group edit-grid__full">
                            <label class="form-label">Features <span style="color:rgba(255,255,255,0.35);font-weight:400;">comma-separated</span></label>
                            <input type="text" name="features" id="editFeatures" class="form-input"
                                   placeholder="e.g. Booking, Gallery, Services">
                        </div>
                        <div class="form-group edit-grid__full">
                            <label class="form-label">Hero tagline</label>
                            <input type="text" name="hero_tagline" id="editHeroTagline" class="form-input">
                        </div>
                        <div class="form-group edit-grid__full">
                            <label class="form-label">Hero sub-heading</label>
                            <input type="text" name="hero_sub" id="editHeroSub" class="form-input">
                        </div>
                        <div class="form-group edit-grid__full">
                            <label class="form-label">Business name</label>
                            <input type="text" name="business_name" id="editBusinessName" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Accent color</label>
                            <div class="color-row">
                                <input type="color" id="editAccentPicker" class="color-swatch"
                                       oninput="document.getElementById('editAccent').value=this.value">
                                <input type="text" name="accent" id="editAccent" class="form-input form-input--color"
                                       placeholder="#a855f7" maxlength="7"
                                       oninput="syncPicker('editAccentPicker',this.value)">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Dark bg color</label>
                            <div class="color-row">
                                <input type="color" id="editDarkPicker" class="color-swatch"
                                       oninput="document.getElementById('editDark').value=this.value">
                                <input type="text" name="dark" id="editDark" class="form-input form-input--color"
                                       placeholder="#0a0b15" maxlength="7"
                                       oninput="syncPicker('editDarkPicker',this.value)">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Light bg color</label>
                            <div class="color-row">
                                <input type="color" id="editLightPicker" class="color-swatch"
                                       oninput="document.getElementById('editLight').value=this.value">
                                <input type="text" name="light" id="editLight" class="form-input form-input--color"
                                       placeholder="#1c1d27" maxlength="7"
                                       oninput="syncPicker('editLightPicker',this.value)">
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions" style="margin-top:24px;">
                        <button type="submit" class="btn-admin btn-admin--primary" id="editSaveBtn">
                            💾 Save Changes
                        </button>
                        <button type="button" class="btn-admin btn-admin--ghost" onclick="closeEditModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Duplicate Template Modal -->
    <div id="duplicateModal" class="modal-backdrop" style="display:none;">
        <div class="modal-box">
            <div class="modal-header">
                <div class="modal-title">Duplicate Template</div>
                <button class="modal-close" onclick="closeDuplicateModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="modal-template-info" id="dupeSourceName"></div>
                <p class="modal-desc" id="dupeDesc"></p>
                <form id="duplicateForm" method="POST"
                      action="<?php echo BASE_PATH; ?>/admin-duplicate.php"
                      onsubmit="return confirmDuplicate()">
                    <input type="hidden" name="source_id"   id="dupeSourceId">
                    <input type="hidden" name="source_type" id="dupeSourceType">
                    <div class="form-group" style="margin-top:4px;">
                        <label class="form-label">New template ID</label>
                        <input type="text" name="new_id" id="dupeNewId" class="form-input"
                               placeholder="e.g. luxury-nails-v2"
                               autocomplete="off" spellcheck="false" required>
                        <span class="form-hint" id="dupeIdHint"></span>
                    </div>
                    <div class="form-group" style="margin-top:14px;">
                        <label class="form-label">Display name</label>
                        <input type="text" name="new_name" id="dupeNewName" class="form-input"
                               placeholder="e.g. Luxury Nails v2" autocomplete="off">
                        <span class="form-hint">Leave blank to use "Copy of [original name]"</span>
                    </div>
                    <div class="modal-actions" style="margin-top:20px;">
                        <button type="submit" class="btn-admin btn-admin--primary" id="dupeBtn">⧉ Duplicate</button>
                        <button type="button" class="btn-admin btn-admin--ghost" onclick="closeDuplicateModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Upload Thumbnail Modal -->
    <div id="uploadThumbModal" class="modal-backdrop" style="display:none;">
        <div class="modal-box">
            <div class="modal-header">
                <div class="modal-title">Upload Catalog Image</div>
                <button class="modal-close" onclick="closeUploadThumbModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="modal-template-info" id="uploadThumbTemplateName"></div>
                <p class="modal-desc">
                    Upload any JPG, PNG, or WebP image. It will be automatically resized and cropped to
                    900×620 px and saved as the catalog card image for this template.
                </p>
                <form id="uploadThumbForm" method="POST"
                      action="<?php echo BASE_PATH; ?>/admin-upload-thumb.php"
                      enctype="multipart/form-data" onsubmit="return confirmUploadThumb()">
                    <input type="hidden" name="template_id" id="uploadThumbTemplateId">
                    <div class="upload-drop upload-drop--compact" id="uploadThumbDropZone"
                         onclick="document.getElementById('uploadThumbFile').click()">
                        <div class="upload-drop__icon" style="font-size:1.8rem;margin-bottom:6px;">🖼️</div>
                        <div class="upload-drop__title" id="uploadThumbDropTitle">Drop image here, or click to browse</div>
                        <div class="upload-drop__sub">JPG · PNG · WebP · up to 20 MB</div>
                        <div id="uploadThumbPreviewWrap" style="display:none;margin-top:12px;">
                            <img id="uploadThumbPreview"
                                 style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);object-fit:cover;">
                        </div>
                        <input type="file" name="thumbimage" id="uploadThumbFile"
                               accept="image/jpeg,image/png,image/webp" required>
                    </div>
                    <div class="modal-actions">
                        <button type="submit" class="btn-admin btn-admin--primary" id="uploadThumbBtn">
                            💾 Save as Catalog Image
                        </button>
                        <button type="button" class="btn-admin btn-admin--ghost"
                                onclick="closeUploadThumbModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Replace Modal -->
    <div id="replaceModal" class="modal-backdrop" style="display:none;">
        <div class="modal-box">
            <div class="modal-header">
                <div class="modal-title">Replace Template</div>
                <button class="modal-close" onclick="closeReplaceModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="modal-template-info" id="modalTemplateName"></div>
                <p class="modal-desc">
                    Upload a new ZIP to rebuild this template. The category stays the same.
                    Name, colors, and hero text are re-detected from your new source files.
                </p>
                <form id="replaceForm" method="POST" action="<?php echo BASE_PATH; ?>/admin-replace.php"
                      enctype="multipart/form-data" onsubmit="return confirmReplace()">
                    <input type="hidden" name="template_id" id="replaceTemplateId">
                    <div class="upload-drop upload-drop--compact" id="replaceDropZone"
                         onclick="document.getElementById('replaceZip').click()">
                        <div class="upload-drop__icon" style="font-size:1.8rem;margin-bottom:6px;">📦</div>
                        <div class="upload-drop__title" id="replaceDropTitle">Drop new ZIP here, or click to browse</div>
                        <div class="upload-drop__sub">React/Vite project ZIP · up to 50 MB</div>
                        <input type="file" name="zipfile" id="replaceZip" accept=".zip" required>
                    </div>
                    <div class="modal-actions">
                        <button type="submit" class="btn-admin btn-admin--orange" id="replaceBtn">
                            🔄 Replace &amp; Rebuild
                        </button>
                        <button type="button" class="btn-admin btn-admin--ghost" onclick="closeReplaceModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- ── Website Scraper ── -->
    <div class="admin-card" id="scraper">
        <div class="admin-card__header">
            <span class="admin-card__title">🌐 Import from URL</span>
            <div style="display:flex;align-items:center;gap:10px;margin-left:auto;">
                <?php if ($_tmp_sessions > 0): ?>
                <span class="scraper-tmp-pill" id="scraperTmpPill">
                    🗂️ <?php echo $_tmp_sessions; ?> tmp session<?php echo $_tmp_sessions !== 1 ? 's' : ''; ?>
                    &nbsp;·&nbsp; <?php echo round($_tmp_bytes / 1024); ?> KB
                </span>
                <button class="btn-admin btn-admin--ghost btn-admin--sm" id="cleanTmpBtn" onclick="runCleanup()">
                    🗑️ Clean Now
                </button>
                <?php else: ?>
                <span class="scraper-tmp-pill scraper-tmp-pill--empty" id="scraperTmpPill">✓ Tmp clean</span>
                <?php endif; ?>
            </div>
        </div>
        <div class="admin-card__body">
            <div id="scraperStep1">
                <p style="color:rgba(255,255,255,0.45);font-size:0.85rem;margin-bottom:22px;line-height:1.75;">
                    Enter any salon or service business website URL. The scraper downloads the homepage — HTML, CSS, images, and fonts —
                    and shows you a live preview. If it looks good, give it a name, pick a category, and add it straight to the catalog.
                </p>
                <div class="scraper-url-row">
                    <input type="url" id="scraperUrl" class="form-input scraper-url-input"
                           placeholder="https://example.com" autocomplete="off" spellcheck="false">
                    <button id="scraperFetchBtn" class="btn-admin btn-admin--primary" onclick="startScrape()">
                        🌐 Fetch &amp; Preview
                    </button>
                </div>
                <div id="scraperStatus" class="scraper-status" style="display:none;"></div>
            </div>
            <div id="scraperStep2" style="display:none;">
                <div class="scraper-preview-header">
                    <div class="scraper-preview-meta">
                        <span class="scraper-preview-label">Scraped preview —</span>
                        <span class="scraper-preview-title" id="scraperPreviewTitle"></span>
                        <a class="scraper-preview-src" id="scraperPreviewSrc" href="#" target="_blank" rel="noopener"></a>
                    </div>
                    <button class="btn-admin btn-admin--ghost btn-admin--sm" onclick="resetScraper()">↩ Try Another URL</button>
                </div>
                <div class="scraper-preview-wrap">
                    <iframe id="scraperPreviewIframe" class="scraper-preview-iframe" src="about:blank"
                            sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
                    <div class="scraper-preview-overlay-badge">Scraped Preview</div>
                </div>
                <div class="scraper-accept-bar">
                    <span class="scraper-accept-bar__icon">✅</span>
                    <span>Looks good? Fill in the details below and create the catalog card.</span>
                </div>
                <form id="scraperSaveForm" method="POST"
                      action="<?php echo BASE_PATH; ?>/admin-scraper-save.php"
                      onsubmit="return confirmScraperSave()">
                    <input type="hidden" name="uuid"       id="scraperUuid">
                    <input type="hidden" name="source_url" id="scraperSourceUrl">
                    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:16px;max-width:820px;margin-top:24px;">
                        <div class="form-group">
                            <label class="form-label">Template Name *</label>
                            <input type="text" name="name" id="scraperName" class="form-input"
                                   placeholder="e.g. Miami Nails Studio" required autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Category *</label>
                            <select name="category" id="scraperCategory" class="form-select" required>
                                <option value="">— Select category —</option>
                                <option value="Hair Salon">Hair Salon</option>
                                <option value="Barbershop">Barbershop</option>
                                <option value="Nail Salon">Nail Salon</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Template ID *</label>
                            <input type="text" name="template_id" id="scraperTemplateId" class="form-input"
                                   placeholder="e.g. miami-nails-studio" required
                                   autocomplete="off" spellcheck="false">
                            <span class="form-hint" id="scraperIdHint"></span>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Badge</label>
                            <select name="badge" class="form-select">
                                <option value="">— none —</option>
                                <option value="new" selected>new</option>
                                <option value="popular">popular</option>
                                <option value="premium">premium</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Style tag</label>
                            <input type="text" name="style" id="scraperStyle" class="form-input"
                                   placeholder="e.g. Modern, Luxury, Clean">
                        </div>
                    </div>
                    <div class="form-actions" style="margin-top:20px;">
                        <button type="submit" class="btn-admin btn-admin--orange" id="scraperSaveBtn">
                            💾 Create Template Card
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

</div>

<script>
const _existingIds = <?php echo json_encode(array_keys($all_templates)); ?>;
const _tplData     = <?php echo json_encode($all_templates); ?>;

// ── Delete modal ──────────────────────────────────────────────────────────────
let _deleteId = '';
document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
        _deleteId = btn.dataset.id;
        const name = btn.dataset.name;
        const type = btn.dataset.type;
        document.getElementById('deleteTemplateId').value    = _deleteId;
        document.getElementById('deleteTemplateName').textContent = name + '  (' + _deleteId + ')';
        document.getElementById('deleteConfirmInput').value  = '';
        document.getElementById('deleteConfirmHint').textContent = 'Must match: ' + _deleteId;
        document.getElementById('deleteBtn').disabled = true;
        document.getElementById('deleteReactNote').style.display = type === 'react' ? 'block' : 'none';
        document.getElementById('deletePhpNote').style.display   = type === 'php'   ? 'block' : 'none';
        document.querySelectorAll('#deleteReactNote li').forEach(li => {
            li.innerHTML = li.innerHTML.replace(/\{id\}/g, _deleteId);
        });
        document.getElementById('deleteModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('deleteConfirmInput').focus(), 80);
    });
});
document.getElementById('deleteConfirmInput').addEventListener('input', function() {
    const matches = this.value.trim() === _deleteId;
    document.getElementById('deleteBtn').disabled = !matches;
    this.style.borderColor = this.value ? (matches ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.4)') : '';
});
function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    document.body.style.overflow = '';
}
document.getElementById('deleteModal').addEventListener('click', function(e) {
    if (e.target === this) closeDeleteModal();
});
function confirmDelete() {
    if (document.getElementById('deleteConfirmInput').value.trim() !== _deleteId) return false;
    const btn = document.getElementById('deleteBtn');
    btn.innerHTML = '<span class="spinner"></span> Deleting…';
    btn.disabled  = true;
    return true;
}

// ── Replace modal ─────────────────────────────────────────────────────────────
document.querySelectorAll('.btn-replace').forEach(btn => {
    btn.addEventListener('click', () => {
        const id   = btn.dataset.id;
        const name = btn.dataset.name;
        document.getElementById('replaceTemplateId').value = id;
        document.getElementById('modalTemplateName').textContent = name + '  (' + id + ')';
        document.getElementById('replaceDropTitle').textContent  = 'Drop new ZIP here, or click to browse';
        document.getElementById('replaceBtn').innerHTML = '🔄 Replace & Rebuild';
        document.getElementById('replaceBtn').disabled  = false;
        document.getElementById('replaceZip').value     = '';
        document.getElementById('replaceModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });
});
function closeReplaceModal() {
    document.getElementById('replaceModal').style.display = 'none';
    document.body.style.overflow = '';
}
document.getElementById('replaceModal').addEventListener('click', function(e) {
    if (e.target === this) closeReplaceModal();
});
const replaceDropZone = document.getElementById('replaceDropZone');
const replaceZip      = document.getElementById('replaceZip');
replaceDropZone.addEventListener('dragover', e => { e.preventDefault(); replaceDropZone.classList.add('drag-over'); });
replaceDropZone.addEventListener('dragleave', () => replaceDropZone.classList.remove('drag-over'));
replaceDropZone.addEventListener('drop', e => {
    e.preventDefault(); replaceDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
        const dt = new DataTransfer(); dt.items.add(file); replaceZip.files = dt.files;
        onReplaceFileSelected(file.name);
    }
});
replaceZip.addEventListener('change', () => { if (replaceZip.files[0]) onReplaceFileSelected(replaceZip.files[0].name); });
function onReplaceFileSelected(name) {
    document.getElementById('replaceDropTitle').textContent = '📦 ' + name + ' — ready';
}
function confirmReplace() {
    if (!replaceZip.files[0]) { alert('Please select a ZIP file.'); return false; }
    const btn = document.getElementById('replaceBtn');
    btn.innerHTML = '<span class="spinner"></span> Rebuilding… (this takes ~60 s)';
    btn.disabled  = true;
    return true;
}

// ── Upload thumbnail modal ────────────────────────────────────────────────────
document.querySelectorAll('.btn-upload-thumb').forEach(btn => {
    btn.addEventListener('click', () => {
        const id   = btn.dataset.id;
        const name = btn.dataset.name;
        document.getElementById('uploadThumbTemplateId').value        = id;
        document.getElementById('uploadThumbTemplateName').textContent = name + '  (' + id + ')';
        document.getElementById('uploadThumbDropTitle').textContent    = 'Drop image here, or click to browse';
        document.getElementById('uploadThumbPreviewWrap').style.display = 'none';
        document.getElementById('uploadThumbFile').value  = '';
        document.getElementById('uploadThumbBtn').innerHTML = '💾 Save as Catalog Image';
        document.getElementById('uploadThumbBtn').disabled  = false;
        document.getElementById('uploadThumbModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });
});
const uploadThumbDropZone = document.getElementById('uploadThumbDropZone');
const uploadThumbFile     = document.getElementById('uploadThumbFile');
uploadThumbDropZone.addEventListener('dragover', e => { e.preventDefault(); uploadThumbDropZone.classList.add('drag-over'); });
uploadThumbDropZone.addEventListener('dragleave', () => uploadThumbDropZone.classList.remove('drag-over'));
uploadThumbDropZone.addEventListener('drop', e => {
    e.preventDefault(); uploadThumbDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        const dt = new DataTransfer(); dt.items.add(file); uploadThumbFile.files = dt.files;
        onThumbFileSelected(file);
    }
});
uploadThumbFile.addEventListener('change', () => { if (uploadThumbFile.files[0]) onThumbFileSelected(uploadThumbFile.files[0]); });
function onThumbFileSelected(file) {
    document.getElementById('uploadThumbDropTitle').textContent = '🖼️ ' + file.name + ' — ready';
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('uploadThumbPreview').src = e.target.result;
        document.getElementById('uploadThumbPreviewWrap').style.display = 'block';
    };
    reader.readAsDataURL(file);
}
function closeUploadThumbModal() {
    document.getElementById('uploadThumbModal').style.display = 'none';
    document.body.style.overflow = '';
}
document.getElementById('uploadThumbModal').addEventListener('click', function(e) {
    if (e.target === this) closeUploadThumbModal();
});
function confirmUploadThumb() {
    if (!uploadThumbFile.files[0]) { alert('Please select an image.'); return false; }
    const btn = document.getElementById('uploadThumbBtn');
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    btn.disabled  = true;
    return true;
}

// ── Edit modal ────────────────────────────────────────────────────────────────
document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const t  = _tplData[id];
        if (!t) return;
        document.getElementById('editTemplateId').value    = id;
        document.getElementById('editTemplateName').textContent = t.name + '  (' + id + ')';
        document.getElementById('editName').value          = t.name || '';
        document.getElementById('editCategory').value      = t.category || '';
        document.getElementById('editStyle').value         = t.style || '';
        document.getElementById('editBadge').value         = t.badge || '';
        document.getElementById('editDesc').value          = t.desc || '';
        document.getElementById('editFeatures').value      = Array.isArray(t.features) ? t.features.join(', ') : (t.features || '');
        document.getElementById('editHeroTagline').value   = t.hero_tagline || '';
        document.getElementById('editHeroSub').value       = t.hero_sub || '';
        document.getElementById('editBusinessName').value  = t.business_name || '';
        document.getElementById('editAccent').value        = t.accent || '';
        document.getElementById('editDark').value          = t.dark || '';
        document.getElementById('editLight').value         = t.light || '';
        const syncColors = ['editAccent','editDark','editLight'];
        const pickers    = ['editAccentPicker','editDarkPicker','editLightPicker'];
        syncColors.forEach((fid, i) => {
            const v = document.getElementById(fid).value;
            if (/^#[0-9a-f]{6}$/i.test(v)) document.getElementById(pickers[i]).value = v;
        });
        document.getElementById('editModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });
});
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.body.style.overflow = '';
}
document.getElementById('editModal').addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
});
function syncPicker(pickerId, hexVal) {
    if (/^#[0-9a-f]{6}$/i.test(hexVal)) document.getElementById(pickerId).value = hexVal;
}
function confirmEdit() {
    const btn = document.getElementById('editSaveBtn');
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    btn.disabled  = true;
    return true;
}

// ── Duplicate modal ───────────────────────────────────────────────────────────
document.querySelectorAll('.btn-duplicate').forEach(btn => {
    btn.addEventListener('click', () => {
        const id   = btn.dataset.id;
        const name = btn.dataset.name;
        const type = btn.dataset.type;
        const cat  = btn.dataset.category;
        document.getElementById('dupeSourceId').value   = id;
        document.getElementById('dupeSourceType').value = type;
        document.getElementById('dupeSourceName').textContent = name + '  (' + id + ')';
        document.getElementById('dupeDesc').textContent = type === 'react'
            ? 'Copies built files and source, then registers a new catalog entry.'
            : 'Creates a new catalog entry pointing to the same PHP template files.';
        document.getElementById('dupeNewId').value   = '';
        document.getElementById('dupeNewName').value = '';
        document.getElementById('dupeIdHint').textContent = '';
        document.getElementById('dupeNewId').style.borderColor = '';
        document.getElementById('dupeBtn').innerHTML = '⧉ Duplicate';
        document.getElementById('dupeBtn').disabled  = false;
        document.getElementById('duplicateModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('dupeNewId').focus(), 80);
    });
});
document.getElementById('dupeNewId').addEventListener('input', function() {
    const val   = this.value.trim().toLowerCase().replace(/[^a-z0-9\-]/g, '');
    this.value  = val;
    const taken = _existingIds.includes(val);
    const hint  = document.getElementById('dupeIdHint');
    if (!val) { hint.textContent = ''; this.style.borderColor = ''; }
    else if (taken) { hint.textContent = 'This ID is already in use.'; hint.style.color = 'rgba(248,113,113,0.8)'; this.style.borderColor = 'rgba(248,113,113,0.4)'; }
    else { hint.textContent = '✓ Available'; hint.style.color = 'rgba(52,211,153,0.8)'; this.style.borderColor = 'rgba(52,211,153,0.4)'; }
});
function closeDuplicateModal() {
    document.getElementById('duplicateModal').style.display = 'none';
    document.body.style.overflow = '';
}
document.getElementById('duplicateModal').addEventListener('click', function(e) {
    if (e.target === this) closeDuplicateModal();
});
function confirmDuplicate() {
    const newId = document.getElementById('dupeNewId').value.trim();
    if (!newId) { alert('Please enter a new template ID.'); return false; }
    if (_existingIds.includes(newId)) { alert('That ID is already in use.'); return false; }
    const btn = document.getElementById('dupeBtn');
    btn.innerHTML = '<span class="spinner"></span> Duplicating…';
    btn.disabled  = true;
    return true;
}

// ── Image Library Modal ───────────────────────────────────────────────────────
let _mediaLibLoaded = false;
function openMediaLibModal() {
    document.getElementById('mediaLibModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (!_mediaLibLoaded) loadMediaLib();
}
function closeMediaLibModal() {
    document.getElementById('mediaLibModal').style.display = 'none';
    document.body.style.overflow = '';
}
document.getElementById('mediaLibModal').addEventListener('click', function(e) {
    if (e.target === this) closeMediaLibModal();
});
async function loadMediaLib(force = false) {
    const container = document.getElementById('mediaLibContent');
    container.innerHTML = '<div class="media-lib-loading">Loading…</div>';
    try {
        const res = await fetch('<?php echo BASE_PATH; ?>/admin-media-library.php', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        container.innerHTML = await res.text();
        _mediaLibLoaded = !force;
        initMediaLib(container);
    } catch (err) {
        container.innerHTML = '<p style="color:rgba(255,255,255,0.4);padding:30px;text-align:center;">Could not load library — ' + err.message + '</p>';
    }
}
function initMediaLib(root) {
    root.querySelectorAll('.media-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            root.querySelectorAll('.media-tab').forEach(t => t.classList.remove('media-tab--active'));
            root.querySelectorAll('.media-panel').forEach(p => p.classList.remove('media-panel--active'));
            tab.classList.add('media-tab--active');
            const panel = root.querySelector('#mpanel-' + tab.dataset.slug);
            if (panel) panel.classList.add('media-panel--active');
        });
    });
    root.querySelectorAll('.media-upload-input').forEach(input => {
        input.addEventListener('change', async () => {
            if (!input.files[0]) return;
            const slug   = input.dataset.slug;
            const status = root.querySelector('#mupload-status-' + slug);
            status.textContent = 'Uploading…'; status.style.color = 'rgba(255,255,255,0.5)';
            const fd = new FormData();
            fd.append('slug', slug); fd.append('image', input.files[0]);
            try {
                const res  = await fetch('<?php echo BASE_PATH; ?>/admin-media-upload.php', { method: 'POST', body: fd });
                const data = await res.json();
                if (data.ok) {
                    status.textContent = '✓ Uploaded'; status.style.color = '#4ade80';
                    loadMediaLib(true);
                } else { status.textContent = '✗ ' + (data.error || 'Upload failed'); status.style.color = '#f87171'; }
            } catch (err) { status.textContent = '✗ Network error'; status.style.color = '#f87171'; }
            input.value = '';
        });
    });
    root.querySelectorAll('.btn-media-del').forEach(btn => attachMediaDelHandler(btn, root));
}
function attachMediaDelHandler(btn, root) {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this image? This cannot be undone.')) return;
        const fd = new FormData();
        fd.append('file', btn.dataset.file); fd.append('slug', btn.dataset.slug);
        try {
            const res  = await fetch('<?php echo BASE_PATH; ?>/admin-media-delete.php', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.ok) { btn.closest('.media-card').remove(); }
            else { alert('Delete failed: ' + (data.error || 'Unknown error')); }
        } catch (err) { alert('Network error — please try again.'); }
    });
}

// ── Inline name edit ──────────────────────────────────────────────────────────
function cancelInlineEdit(cell) {
    cell.querySelector('.tpl-name-text').style.display    = '';
    cell.querySelector('.tpl-name-edit-btn').style.display = '';
    cell.querySelector('.tpl-name-editing').style.display  = 'none';
}
document.querySelectorAll('.tpl-name-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const cell = btn.closest('.tbl-name');
        cell.querySelector('.tpl-name-text').style.display = 'none';
        btn.style.display = 'none';
        const editing = cell.querySelector('.tpl-name-editing');
        editing.style.display = 'inline-flex';
        editing.querySelector('.tpl-name-input').select();
    });
});
document.querySelectorAll('.tpl-name-cancel').forEach(btn => {
    btn.addEventListener('click', () => cancelInlineEdit(btn.closest('.tbl-name')));
});
document.querySelectorAll('.tpl-name-save').forEach(btn => {
    btn.addEventListener('click', async () => {
        const cell    = btn.closest('.tbl-name');
        const id      = cell.dataset.id;
        const input   = cell.querySelector('.tpl-name-input');
        const newName = input.value.trim();
        if (!newName) { input.focus(); return; }
        const origText = btn.textContent;
        btn.textContent = '…'; btn.disabled = true;
        try {
            const fd = new FormData();
            fd.append('template_id', id); fd.append('name', newName);
            const res  = await fetch('<?php echo BASE_PATH; ?>/admin-rename.php', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.ok) {
                cell.querySelector('.tpl-name-text').textContent = newName;
                if (_tplData[id]) _tplData[id].name = newName;
                cancelInlineEdit(cell);
            } else { alert('Error: ' + (data.error || 'Could not rename.')); btn.textContent = origText; btn.disabled = false; }
        } catch (err) { alert('Network error.'); btn.textContent = origText; btn.disabled = false; }
    });
});
document.querySelectorAll('.tpl-name-input').forEach(input => {
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.closest('.tbl-name').querySelector('.tpl-name-save').click(); }
        if (e.key === 'Escape') cancelInlineEdit(input.closest('.tbl-name'));
    });
});

// ── Scraper cleanup ───────────────────────────────────────────────────────────
async function runCleanup(maxAge = 86400) {
    const btn  = document.getElementById('cleanTmpBtn');
    const pill = document.getElementById('scraperTmpPill');
    if (btn) { btn.innerHTML = '<span class="spinner"></span> Cleaning…'; btn.disabled = true; }
    try {
        const fd = new FormData(); fd.append('max_age', maxAge);
        const res  = await fetch('<?php echo BASE_PATH; ?>/admin-scraper-cleanup.php', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            const freed = data.freed_kb > 1024 ? (data.freed_kb / 1024).toFixed(1) + ' MB' : data.freed_kb + ' KB';
            showFlash('success', data.deleted > 0
                ? `Cleanup complete — ${data.deleted} session(s) removed, ${freed} freed.`
                : 'Nothing to clean — all sessions are still fresh.');
            if (pill) {
                if (data.kept === 0) { pill.className = 'scraper-tmp-pill scraper-tmp-pill--empty'; pill.textContent = '✓ Tmp clean'; if (btn) btn.remove(); }
                else { pill.textContent = `🗂️ ${data.kept} tmp session(s)`; if (btn) { btn.textContent = '🗑️ Clean Now'; btn.disabled = false; } }
            }
        } else { showFlash('error', 'Cleanup failed: ' + (data.error || 'Unknown error')); if (btn) { btn.textContent = '🗑️ Clean Now'; btn.disabled = false; } }
    } catch (err) { showFlash('error', 'Cleanup request failed: ' + err.message); if (btn) { btn.textContent = '🗑️ Clean Now'; btn.disabled = false; } }
}

// ── Re-scrape button ──────────────────────────────────────────────────────────
document.querySelectorAll('.btn-rescrape').forEach(btn => {
    btn.addEventListener('click', async function() {
        const id  = this.dataset.id;
        const name = this.dataset.name;
        const src  = this.dataset.src;
        if (!confirm('Re-scrape "' + name + '"?\n\nThis will re-download the original site.' + (src ? '\n\nSource: ' + src : ''))) return;
        const origText = this.textContent.trim();
        this.innerHTML = '<span class="spinner"></span> Scraping…'; this.disabled = true;
        try {
            const fd = new FormData(); fd.append('template_id', id);
            const res  = await fetch('<?php echo BASE_PATH; ?>/admin-rescrape.php', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) { showFlash('success', '"' + name + '" re-scraped — ' + Math.round((data.total_bytes||0)/1024) + ' KB, ' + (data.asset_count||0) + ' assets.'); this.textContent = 'Re-scrape'; this.disabled = false; }
            else { showFlash('error', 'Re-scrape failed: ' + (data.error || 'Unknown error')); this.textContent = origText; this.disabled = false; }
        } catch (err) { showFlash('error', 'Network error: ' + err.message); this.textContent = origText; this.disabled = false; }
    });
});

function showFlash(type, msg) {
    document.querySelectorAll('.flash-msg').forEach(el => el.remove());
    const div = document.createElement('div');
    div.className = 'flash-msg flash-msg--' + type;
    div.innerHTML = '<span>' + (type === 'success' ? '✅' : '❌') + '</span><span>' + msg + '</span>'
        + '<button class="flash-msg__close" onclick="this.closest(\'.flash-msg\').remove()">✕</button>';
    const layout = document.querySelector('.admin-layout');
    const firstCard = layout ? layout.querySelector('.admin-card') : null;
    if (firstCard) layout.insertBefore(div, firstCard); else document.body.prepend(div);
    setTimeout(() => div.remove(), 7000);
}

// ── Website Scraper ───────────────────────────────────────────────────────────
async function startScrape() {
    let rawUrl = document.getElementById('scraperUrl').value.trim();
    if (!rawUrl) { document.getElementById('scraperUrl').focus(); return; }
    if (!/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;
    const btn = document.getElementById('scraperFetchBtn');
    const status = document.getElementById('scraperStatus');
    let host = rawUrl; try { host = new URL(rawUrl).hostname; } catch(e) {}
    btn.innerHTML = '<span class="spinner"></span> Fetching…'; btn.disabled = true;
    status.style.display = 'flex'; status.className = 'scraper-status scraper-status--loading';
    status.innerHTML = '🌐 Connecting to <strong>' + host + '</strong>…';
    try {
        const fd = new FormData(); fd.append('url', rawUrl);
        const res  = await fetch('<?php echo BASE_PATH; ?>/admin-scraper.php', { method: 'POST', body: fd });
        const data = await res.json();
        if (!data.success) {
            status.className = 'scraper-status scraper-status--error';
            status.innerHTML = '❌ ' + (data.error || 'Scrape failed. Try a different URL.');
            btn.innerHTML = '🌐 Fetch &amp; Preview'; btn.disabled = false;
            return;
        }
        status.style.display = 'none';
        document.getElementById('scraperStep1').style.display = 'none';
        document.getElementById('scraperPreviewTitle').textContent = data.title || host;
        const srcLink = document.getElementById('scraperPreviewSrc');
        srcLink.textContent = data.source_url; srcLink.href = data.source_url;
        document.getElementById('scraperPreviewIframe').src = data.preview_url;
        document.getElementById('scraperUuid').value        = data.uuid;
        document.getElementById('scraperSourceUrl').value   = data.source_url;
        const raw    = (data.title || host).replace(/ [|\-–—].*/,'').trim();
        const autoId = raw.toLowerCase().replace(/[^\w\s]/g,'').trim().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'').replace(/-+/g,'-').substring(0,48);
        document.getElementById('scraperName').value = raw.substring(0,80);
        const idField = document.getElementById('scraperTemplateId');
        if (!idField.dataset.userEdited) { idField.value = autoId; validateScraperId(); }
        document.getElementById('scraperStep2').style.display = 'block';
        document.getElementById('scraperStep2').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        status.className = 'scraper-status scraper-status--error';
        status.innerHTML = '❌ Network error — ' + err.message;
        btn.innerHTML = '🌐 Fetch &amp; Preview'; btn.disabled = false;
    }
}
function resetScraper() {
    document.getElementById('scraperStep1').style.display  = 'block';
    document.getElementById('scraperStep2').style.display  = 'none';
    document.getElementById('scraperUrl').value            = '';
    document.getElementById('scraperFetchBtn').innerHTML   = '🌐 Fetch &amp; Preview';
    document.getElementById('scraperFetchBtn').disabled    = false;
    document.getElementById('scraperStatus').style.display = 'none';
    document.getElementById('scraperPreviewIframe').src    = 'about:blank';
    document.getElementById('scraperName').value = '';
    document.getElementById('scraperTemplateId').value = '';
    document.getElementById('scraperTemplateId').dataset.userEdited = '';
    document.getElementById('scraperIdHint').textContent = '';
}
function validateScraperId() {
    const input = document.getElementById('scraperTemplateId');
    const hint  = document.getElementById('scraperIdHint');
    let val = input.value.toLowerCase().replace(/[^a-z0-9\-]/g,'').replace(/-+/g,'-');
    input.value = val;
    if (!val) { hint.textContent = ''; input.style.borderColor = ''; return; }
    const taken = _existingIds.includes(val);
    if (taken) { hint.textContent = '✗ ID already in use'; hint.style.color = 'rgba(248,113,113,0.85)'; input.style.borderColor = 'rgba(248,113,113,0.45)'; }
    else { hint.textContent = '✓ Available'; hint.style.color = 'rgba(52,211,153,0.85)'; input.style.borderColor = 'rgba(52,211,153,0.45)'; }
}
function confirmScraperSave() {
    const id = document.getElementById('scraperTemplateId').value.trim();
    if (_existingIds.includes(id)) { alert('That template ID is already in use.'); return false; }
    if (!id) { document.getElementById('scraperTemplateId').focus(); return false; }
    const btn = document.getElementById('scraperSaveBtn');
    btn.innerHTML = '<span class="spinner"></span> Saving…'; btn.disabled = true;
    return true;
}
document.getElementById('scraperTemplateId')?.addEventListener('input', function() { this.dataset.userEdited = 'true'; validateScraperId(); });
document.getElementById('scraperName')?.addEventListener('input', function() {
    const idField = document.getElementById('scraperTemplateId');
    if (idField.dataset.userEdited) return;
    const autoId = this.value.toLowerCase().replace(/[^\w\s]/g,'').trim().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'').replace(/-+/g,'-').substring(0,48);
    idField.value = autoId; validateScraperId();
});
document.getElementById('scraperUrl')?.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); startScrape(); } });

// ── Global Escape key ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeReplaceModal(); closeDeleteModal(); closeUploadThumbModal();
        closeDuplicateModal(); closeEditModal(); closeMediaLibModal();
    }
});
</script>
</body>
</html>
