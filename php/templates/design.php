<?php
/**
 * Template Design Detail Page
 * Shows a specific design with all its theme variations
 */

require_once __DIR__ . '/../includes/TemplateManager.php';

$manager = getTemplateManager();

// Get parameters
$categoryId = isset($_GET['category']) ? $_GET['category'] : null;
$designId = isset($_GET['design']) ? $_GET['design'] : null;
$selectedThemeId = isset($_GET['theme']) ? $_GET['theme'] : null;

// Validate and load data
if (!$categoryId || !$designId) {
    header('Location: /templates.php');
    exit;
}

$category = $manager->getCategory($categoryId);
$design = $manager->getDesign($categoryId, $designId);

if (!$category || !$design) {
    header('Location: /templates.php');
    exit;
}

$themes = $design['themes'] ?? [];
$selectedTheme = null;

// Find selected theme or default to first
if ($selectedThemeId) {
    foreach ($themes as $theme) {
        if ($theme['id'] === $selectedThemeId) {
            $selectedTheme = $theme;
            break;
        }
    }
}

if (!$selectedTheme && !empty($themes)) {
    $selectedTheme = $themes[0];
}

$pageTitle = $design['name'] . ' | LaunchSite Templates';
$pageDescription = $design['longDescription'] ?? $design['description'];

require __DIR__ . '/../includes/header.php';
require __DIR__ . '/../includes/nav.php';
?>

<!-- ══════════════ DESIGN HERO ══════════════ -->
<section style="background: linear-gradient(135deg, <?= $selectedTheme['bgColor'] ?? '#1a1a2e' ?> 0%, <?= $selectedTheme['accentColor'] ?? '#6366f1' ?>40 100%); padding: 80px 0 40px;">
  <div class="container">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center;">
      <div>
        <!-- Breadcrumb -->
        <nav style="margin-bottom: 24px;">
          <a href="/templates.php" style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.875rem;">Templates</a>
          <span style="color: rgba(255,255,255,0.4); margin: 0 8px;">/</span>
          <a href="/templates.php?category=<?= $category['id'] ?>" style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.875rem;">
            <?= $category['emoji'] ?> <?= $category['label'] ?>
          </a>
          <span style="color: rgba(255,255,255,0.4); margin: 0 8px;">/</span>
          <span style="color: white; font-size: 0.875rem;"><?= $design['name'] ?></span>
        </nav>
        
        <h1 style="font-family: 'Cormorant Garamond', serif; font-size: 3rem; font-weight: 600; color: white; margin-bottom: 16px;">
          <?= $design['name'] ?>
        </h1>
        <p style="font-size: 1.125rem; color: rgba(255,255,255,0.8); line-height: 1.7; margin-bottom: 24px;">
          <?= $design['longDescription'] ?? $design['description'] ?>
        </p>
        
        <!-- Stats -->
        <div style="display: flex; gap: 24px; margin-bottom: 32px;">
          <div style="display: flex; align-items: center; gap: 8px; color: white;">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            <span><?= count($themes) ?> style variations</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; color: white;">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
            <span>5 min setup</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; color: white;">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            <span>Free to use</span>
          </div>
        </div>
        
        <!-- CTA -->
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <a 
            href="<?= $manager->getEditorUrl($category['id'], $design['id'], $selectedTheme['id'] ?? null) ?>" 
            style="background: white; color: <?= $selectedTheme['accentColor'] ?? '#6366f1' ?>; padding: 14px 28px; border-radius: 10px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
            Use This Template
          </a>
          <a href="#themes" style="border: 2px solid rgba(255,255,255,0.3); color: white; padding: 12px 26px; border-radius: 10px; font-weight: 500; text-decoration: none;">
            View All Styles
          </a>
        </div>
      </div>
      
      <!-- Preview Image -->
      <div style="position: relative;">
        <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
          <img 
            src="<?= $design['heroImage'] ?>" 
            alt="<?= $design['name'] ?> preview"
            style="width: 100%; aspect-ratio: 4/3; object-fit: cover;"
          >
          <div style="padding: 16px; background: white; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 12px; height: 12px; border-radius: 50%; background: <?= $selectedTheme['accentColor'] ?>;"></span>
              <span style="font-weight: 500; color: #374151;"><?= $selectedTheme['name'] ?></span>
            </div>
            <span style="font-size: 0.875rem; color: #6b7280;"><?= $selectedTheme['style'] ?> style</span>
          </div>
        </div>
        
        <!-- Floating badge -->
        <div style="position: absolute; -bottom: 20px; -right: 20px; background: <?= $selectedTheme['accentColor'] ?>; color: white; padding: 12px 20px; border-radius: 30px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <?= $category['emoji'] ?> <?= $category['label'] ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════ FEATURES SECTION ══════════════ -->
<section style="padding: 60px 0; background: white;">
  <div class="container">
    <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 1.75rem; font-weight: 600; color: #111827; margin-bottom: 32px; text-align: center;">
      What's included
    </h2>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px;">
      <?php foreach ($design['features'] as $feature): ?>
        <div style="display: flex; align-items: flex-start; gap: 16px; padding: 20px; background: #f9fafb; border-radius: 12px;">
          <div style="width: 40px; height: 40px; background: <?= $selectedTheme['accentColor'] ?>20; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="<?= $selectedTheme['accentColor'] ?>"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
          </div>
          <div>
            <h3 style="font-weight: 600; color: #111827; margin-bottom: 4px;"><?= $feature ?></h3>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══════════════ THEMES GALLERY ══════════════ -->
<section id="themes" style="padding: 80px 0; background: #f9fafb;">
  <div class="container">
    <div style="text-align: center; margin-bottom: 48px;">
      <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 2rem; font-weight: 600; color: #111827;">
        Choose your style
      </h2>
      <p style="color: #6b7280; margin-top: 8px; max-width: 500px; margin-left: auto; margin-right: auto;">
        <?= $design['name'] ?> comes in <?= count($themes) ?> beautiful color variations. Select the one that matches your brand.
      </p>
    </div>
    
    <!-- Selected Theme Preview -->
    <?php if ($selectedTheme): ?>
    <div style="background: white; border-radius: 20px; overflow: hidden; border: 2px solid <?= $selectedTheme['accentColor'] ?>; margin-bottom: 48px; box-shadow: 0 4px 20px <?= $selectedTheme['accentColor'] ?>30;">
      <div style="display: grid; grid-template-columns: 2fr 1fr;">
        <div style="aspect-ratio: 16/10; overflow: hidden; background: linear-gradient(135deg, <?= $selectedTheme['bgColor'] ?> 0%, <?= $selectedTheme['accentColor'] ?>20 100%);">
          <img 
            src="<?= $design['heroImage'] ?>" 
            alt="<?= $selectedTheme['name'] ?>"
            style="width: 100%; height: 100%; object-fit: cover;"
          >
        </div>
        <div style="padding: 32px; display: flex; flex-direction: column; justify-content: center;">
          <span style="display: inline-block; background: <?= $selectedTheme['accentColor'] ?>; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; margin-bottom: 16px; width: fit-content;">
            Selected Style
          </span>
          <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 1.75rem; font-weight: 600; color: #111827; margin-bottom: 8px;">
            <?= $selectedTheme['name'] ?>
          </h3>
          <p style="color: #6b7280; margin-bottom: 16px;">
            <?= $selectedTheme['description'] ?>
          </p>
          <div style="display: flex; gap: 12px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 20px; height: 20px; border-radius: 4px; background: <?= $selectedTheme['accentColor'] ?>;"></span>
              <span style="font-size: 0.75rem; color: #6b7280;">Accent</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 20px; height: 20px; border-radius: 4px; background: <?= $selectedTheme['bgColor'] ?>; border: 1px solid #e5e7eb;"></span>
              <span style="font-size: 0.75rem; color: #6b7280;">Background</span>
            </div>
          </div>
          <a 
            href="<?= $manager->getEditorUrl($category['id'], $design['id'], $selectedTheme['id']) ?>" 
            style="background: <?= $selectedTheme['accentColor'] ?>; color: white; padding: 12px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; text-align: center;"
          >
            Use This Style
          </a>
        </div>
      </div>
    </div>
    <?php endif; ?>
    
    <!-- All Themes Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px;">
      <?php foreach ($themes as $theme): 
        $isSelected = $selectedTheme && $theme['id'] === $selectedTheme['id'];
      ?>
        <a 
          href="?category=<?= $category['id'] ?>&design=<?= $design['id'] ?>&theme=<?= $theme['id'] ?>#themes"
          style="display: block; background: white; border-radius: 12px; overflow: hidden; border: 2px solid <?= $isSelected ? $theme['accentColor'] : 'transparent' ?>; box-shadow: <?= $isSelected ? '0 4px 12px ' . $theme['accentColor'] . '40' : '0 1px 3px rgba(0,0,0,0.1)' ?>; text-decoration: none; transition: transform 0.2s;"
          onmouseover="this.style.transform='translateY(-4px)';"
          onmouseout="this.style.transform='';"
        >
          <div style="aspect-ratio: 4/3; background: linear-gradient(135deg, <?= $theme['bgColor'] ?> 0%, <?= $theme['accentColor'] ?>30 100%); position: relative;">
            <img 
              src="<?= $design['heroImage'] ?>" 
              alt="<?= $theme['name'] ?>"
              style="width: 100%; height: 100%; object-fit: cover; opacity: 0.7;"
            >
            <div style="position: absolute; bottom: 8px; right: 8px; width: 24px; height: 24px; border-radius: 50%; background: <?= $theme['accentColor'] ?>; border: 2px solid white;"></div>
            <?php if ($isSelected): ?>
              <div style="position: absolute; top: 8px; left: 8px; background: <?= $theme['accentColor'] ?>; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.625rem; font-weight: 700;">
                SELECTED
              </div>
            <?php endif; ?>
          </div>
          <div style="padding: 12px;">
            <h4 style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 0.9375rem;"><?= $theme['name'] ?></h4>
            <p style="font-size: 0.75rem; color: #6b7280;"><?= $theme['style'] ?></p>
          </div>
        </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══════════════ OTHER DESIGNS ══════════════ -->
<section style="padding: 60px 0; background: white;">
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
      <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 1.75rem; font-weight: 600; color: #111827;">
        More <?= $category['label'] ?> designs
      </h2>
      <a href="/templates.php?category=<?= $category['id'] ?>" style="color: #6366f1; font-weight: 500; text-decoration: none;">
        View all →
      </a>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px;">
      <?php 
      $otherDesigns = array_filter($category['designs'], fn($d) => $d['id'] !== $designId);
      foreach (array_slice($otherDesigns, 0, 3) as $otherDesign):
        $firstTheme = $otherDesign['themes'][0] ?? null;
      ?>
        <a 
          href="?category=<?= $category['id'] ?>&design=<?= $otherDesign['id'] ?>"
          style="display: block; background: #f9fafb; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; text-decoration: none; transition: transform 0.2s, box-shadow 0.2s;"
          onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)';"
          onmouseout="this.style.transform='';this.style.boxShadow='';"
        >
          <div style="aspect-ratio: 16/10; overflow: hidden; background: <?= $firstTheme['bgColor'] ?? '#f3f4f6' ?>;">
            <img 
              src="<?= $otherDesign['heroImage'] ?>" 
              alt="<?= $otherDesign['name'] ?>"
              style="width: 100%; height: 100%; object-fit: cover;"
            >
          </div>
          <div style="padding: 20px;">
            <h3 style="font-weight: 600; color: #111827; margin-bottom: 4px;"><?= $otherDesign['name'] ?></h3>
            <p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 12px;"><?= $otherDesign['description'] ?></p>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 500;">
                <?= count($otherDesign['themes']) ?> styles
              </span>
            </div>
          </div>
        </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══════════════ CTA ══════════════ -->
<section style="padding: 80px 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
  <div class="container">
    <div style="text-align: center; max-width: 600px; margin: 0 auto;">
      <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 2.25rem; font-weight: 600; color: white; margin-bottom: 16px;">
        Ready to launch your website?
      </h2>
      <p style="color: rgba(255,255,255,0.7); margin-bottom: 32px; font-size: 1.125rem;">
        Start building with <?= $design['name'] ?> today. Credit card required to subscribe — no charge for <?= TRIAL_DAYS ?> days.
      </p>
      <a 
        href="<?= $manager->getEditorUrl($category['id'], $design['id'], $selectedTheme['id'] ?? null) ?>" 
        style="background: #6366f1; color: white; padding: 16px 32px; border-radius: 10px; font-weight: 600; text-decoration: none; font-size: 1.125rem; display: inline-block;"
      >
        Get Started Free →
      </a>
    </div>
  </div>
</section>

<?php require __DIR__ . '/../includes/footer.php'; ?>
