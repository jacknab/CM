<?php
/**
 * LaunchSite Webpage Editor - React/Vite Application Entry Point
 * 
 * This file serves as the bridge between the PHP marketing site
 * and the React/Vite webpage editor application.
 * 
 * The React app is built separately and its static files are served from:
 * /apps/launcher/dist/ (or wherever the Vite build outputs)
 * 
 * URL Structure:
 * /editor/ - Loads the webpage editor
 * /editor/?template=barbershop - Loads editor with specific template
 * /editor/?site=tobys - Loads editor for existing site
 */

// Page metadata
$pageTitle = 'LaunchSite Editor | Certxa';
$pageDescription = 'Build and customize your salon website with the LaunchSite visual editor.';

// Get query parameters for the React app
$template = isset($_GET['template']) ? htmlspecialchars($_GET['template']) : '';
$site = isset($_GET['site']) ? htmlspecialchars($_GET['site']) : '';

// Check if user is authenticated (placeholder for auth logic)
// In production, this would verify the user session/JWT token
$isAuthenticated = true; // TODO: Implement actual auth check

// If not authenticated, redirect to login
if (!$isAuthenticated) {
    header('Location: /login.php?redirect=' . urlencode($_SERVER['REQUEST_URI']));
    exit;
}

// Path to the React/Vite build files
// This assumes the React app is built and the dist folder is accessible
$reactBuildPath = '/apps/launcher/dist'; // Adjust based on your setup
$reactAssetsPath = '/editor-assets'; // Web-accessible path to built assets

// In production, you might proxy requests or use a different setup
// For now, we'll embed the editor in an iframe or redirect to the React app

?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $pageTitle ?></title>
    <meta name="description" content="<?= $pageDescription ?>">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    
    <!-- Prevent indexing of editor pages -->
    <meta name="robots" content="noindex, nofollow">
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; overflow: hidden; }
        
        /* Editor container - full screen */
        #editor-root {
            width: 100%;
            height: 100%;
            position: relative;
        }
        
        /* Loading state */
        .editor-loading {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            transition: opacity 0.3s ease;
        }
        
        .editor-loading.hidden {
            opacity: 0;
            pointer-events: none;
        }
        
        .loading-spinner {
            width: 48px;
            height: 48px;
            border: 3px solid rgba(99, 102, 241, 0.2);
            border-top-color: #6366f1;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .loading-text {
            margin-top: 16px;
            color: rgba(255, 255, 255, 0.7);
            font-family: 'Inter', sans-serif;
            font-size: 14px;
        }
        
        /* Back to Certxa link */
        .back-link {
            position: fixed;
            top: 16px;
            left: 16px;
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(10px);
            padding: 8px 16px;
            border-radius: 8px;
            color: white;
            text-decoration: none;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        }
        
        .back-link:hover {
            background: rgba(0, 0, 0, 0.7);
        }
        
        .back-link svg {
            width: 16px;
            height: 16px;
        }
        
        /* Iframe container for React app */
        #react-app-frame {
            width: 100%;
            height: 100%;
            border: none;
        }
    </style>
</head>
<body>
    <!-- Back to Certxa link -->
    <a href="/launchsite.php" class="back-link">
        <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/>
        </svg>
        Back to Certxa
    </a>
    
    <!-- Loading screen -->
    <div class="editor-loading" id="loading-screen">
        <div class="loading-spinner"></div>
        <p class="loading-text">Loading LaunchSite Editor...</p>
    </div>
    
    <!-- Editor root - React app mounts here or iframe loads -->
    <div id="editor-root">
        <?php
        // Option 1: Load React app via iframe (simplest for separate builds)
        // The React app runs on its own port/server
        $reactAppUrl = 'http://localhost:23795'; // Vite dev server or production build
        
        // Add query params to pass to React app
        $params = [];
        if ($template) $params['template'] = $template;
        if ($site) $params['site'] = $site;
        
        if (!empty($params)) {
            $reactAppUrl .= '?' . http_build_query($params);
        }
        ?>
        
        <iframe 
            id="react-app-frame" 
            src="<?= $reactAppUrl ?>"
            allow="fullscreen"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        ></iframe>
    </div>
    
    <script>
        // Hide loading screen when iframe loads
        document.getElementById('react-app-frame').addEventListener('load', function() {
            document.getElementById('loading-screen').classList.add('hidden');
        });
        
        // Fallback: Hide loading after 10 seconds max
        setTimeout(function() {
            document.getElementById('loading-screen').classList.add('hidden');
        }, 10000);
        
        // Communication between PHP parent and React iframe
        window.addEventListener('message', function(event) {
            // Verify origin for security
            // if (event.origin !== 'http://localhost:23795') return;
            
            const data = event.data;
            
            // Handle messages from React app
            switch(data.type) {
                case 'EDITOR_LOADED':
                    console.log('LaunchSite Editor loaded successfully');
                    document.getElementById('loading-screen').classList.add('hidden');
                    break;
                    
                case 'SITE_PUBLISHED':
                    // Handle site publish event
                    console.log('Site published:', data.siteId);
                    break;
                    
                case 'NAVIGATE':
                    // Handle navigation requests from editor
                    if (data.url) {
                        window.location.href = data.url;
                    }
                    break;
            }
        });
        
        // Send initialization data to React app
        window.addEventListener('load', function() {
            const frame = document.getElementById('react-app-frame');
            
            // Wait for iframe to be ready
            setTimeout(function() {
                frame.contentWindow.postMessage({
                    type: 'INIT',
                    template: '<?= $template ?>',
                    site: '<?= $site ?>',
                    authToken: '<?= $_SESSION['token'] ?? '' ?>', // Pass auth token
                    apiBaseUrl: '/api'
                }, '*');
            }, 2000);
        });
    </script>
</body>
</html>
