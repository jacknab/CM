<?php
/**
 * TemplateManager - PHP Template Management System for LaunchSite
 * 
 * This class manages template data from JSON configuration
 * and provides methods for accessing templates, categories, and themes.
 * 
 * @author Certxa
 * @version 1.0.0
 */

class TemplateManager
{
    /** @var array Template data loaded from JSON */
    private array $data;
    
    /** @var string Path to templates JSON file */
    private string $dataPath;
    
    /** @var self Singleton instance */
    private static ?self $instance = null;
    
    /**
     * Constructor - Load template data from JSON
     */
    private function __construct()
    {
        $this->dataPath = __DIR__ . '/../data/templates.json';
        $this->loadData();
    }
    
    /**
     * Get singleton instance
     */
    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Load template data from JSON file
     */
    private function loadData(): void
    {
        if (!file_exists($this->dataPath)) {
            throw new Exception("Template data file not found: {$this->dataPath}");
        }
        
        $json = file_get_contents($this->dataPath);
        $this->data = json_decode($json, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception("Invalid JSON in template data: " . json_last_error_msg());
        }
    }
    
    /**
     * Get all template categories
     */
    public function getCategories(): array
    {
        return $this->data['categories'] ?? [];
    }
    
    /**
     * Get available categories only
     */
    public function getAvailableCategories(): array
    {
        return array_filter($this->getCategories(), fn($cat) => $cat['available'] ?? false);
    }
    
    /**
     * Get a specific category by ID
     */
    public function getCategory(string $id): ?array
    {
        foreach ($this->getCategories() as $category) {
            if ($category['id'] === $id) {
                return $category;
            }
        }
        return null;
    }
    
    /**
     * Get all designs for a category
     */
    public function getDesigns(string $categoryId): array
    {
        $category = $this->getCategory($categoryId);
        return $category['designs'] ?? [];
    }
    
    /**
     * Get a specific design by category and design ID
     */
    public function getDesign(string $categoryId, string $designId): ?array
    {
        $designs = $this->getDesigns($categoryId);
        foreach ($designs as $design) {
            if ($design['id'] === $designId) {
                return $design;
            }
        }
        return null;
    }
    
    /**
     * Get all themes for a design
     */
    public function getThemes(string $categoryId, string $designId): array
    {
        $design = $this->getDesign($categoryId, $designId);
        return $design['themes'] ?? [];
    }
    
    /**
     * Get a specific theme
     */
    public function getTheme(string $categoryId, string $designId, string $themeId): ?array
    {
        $themes = $this->getThemes($categoryId, $designId);
        foreach ($themes as $theme) {
            if ($theme['id'] === $themeId) {
                return $theme;
            }
        }
        return null;
    }
    
    /**
     * Get total template count
     */
    public function getTotalTemplateCount(): int
    {
        $count = 0;
        foreach ($this->getCategories() as $category) {
            foreach ($category['designs'] ?? [] as $design) {
                $count += count($design['themes'] ?? []);
            }
        }
        return $count;
    }
    
    /**
     * Get templates by style
     */
    public function getTemplatesByStyle(string $style): array
    {
        $templates = [];
        foreach ($this->getCategories() as $category) {
            foreach ($category['designs'] ?? [] as $design) {
                foreach ($design['themes'] ?? [] as $theme) {
                    if (strcasecmp($theme['style'], $style) === 0) {
                        $templates[] = [
                            'category' => $category,
                            'design' => $design,
                            'theme' => $theme
                        ];
                    }
                }
            }
        }
        return $templates;
    }
    
    /**
     * Search templates by keyword
     */
    public function searchTemplates(string $query): array
    {
        $results = [];
        $query = strtolower($query);
        
        foreach ($this->getCategories() as $category) {
            foreach ($category['designs'] ?? [] as $design) {
                // Search in design name/description
                if (str_contains(strtolower($design['name']), $query) ||
                    str_contains(strtolower($design['description']), $query)) {
                    $results[] = [
                        'type' => 'design',
                        'category' => $category,
                        'design' => $design
                    ];
                }
                
                // Search in themes
                foreach ($design['themes'] ?? [] as $theme) {
                    if (str_contains(strtolower($theme['name']), $query) ||
                        str_contains(strtolower($theme['description']), $query) ||
                        str_contains(strtolower($theme['style']), $query)) {
                        $results[] = [
                            'type' => 'theme',
                            'category' => $category,
                            'design' => $design,
                            'theme' => $theme
                        ];
                    }
                }
            }
        }
        
        return $results;
    }
    
    /**
     * Get editor URL for a template
     */
    public function getEditorUrl(string $categoryId, string $designId, ?string $themeId = null): string
    {
        $params = [
            'category' => $categoryId,
            'design' => $designId
        ];
        
        if ($themeId) {
            $params['theme'] = $themeId;
        }
        
        return '/editor/?' . http_build_query($params);
    }
    
    /**
     * Get all available styles
     */
    public function getAllStyles(): array
    {
        $styles = [];
        foreach ($this->getCategories() as $category) {
            foreach ($category['designs'] ?? [] as $design) {
                foreach ($design['themes'] ?? [] as $theme) {
                    $styles[$theme['style']] = ($styles[$theme['style']] ?? 0) + 1;
                }
            }
        }
        
        arsort($styles);
        return $styles;
    }
    
    /**
     * Get templates stats
     */
    public function getStats(): array
    {
        $stats = [
            'categories' => 0,
            'availableCategories' => 0,
            'designs' => 0,
            'themes' => 0,
            'styles' => []
        ];
        
        foreach ($this->getCategories() as $category) {
            $stats['categories']++;
            if ($category['available']) {
                $stats['availableCategories']++;
            }
            
            foreach ($category['designs'] ?? [] as $design) {
                $stats['designs']++;
                foreach ($design['themes'] ?? [] as $theme) {
                    $stats['themes']++;
                    $stats['styles'][$theme['style']] = ($stats['styles'][$theme['style']] ?? 0) + 1;
                }
            }
        }
        
        arsort($stats['styles']);
        return $stats;
    }
    
    /**
     * Reload data from JSON (useful for caching scenarios)
     */
    public function reload(): void
    {
        $this->loadData();
    }
    
    /**
     * Get data version
     */
    public function getVersion(): string
    {
        return $this->data['version'] ?? '1.0.0';
    }
    
    /**
     * Get last updated date
     */
    public function getLastUpdated(): ?string
    {
        return $this->data['lastUpdated'] ?? null;
    }
}

/**
 * Helper function to get TemplateManager instance
 */
function getTemplateManager(): TemplateManager
{
    return TemplateManager::getInstance();
}
