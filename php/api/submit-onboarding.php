<?php
/**
 * POST /launchsite/api/submit-onboarding.php
 * Accepts JSON body, inserts into onboarding_submissions + subdomains.
 * Returns JSON: { success: bool, id: int, ... }
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/db.php';

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// ── Helper ────────────────────────────────────────────────────────────────────
function req(array $data, string $key): string {
    $v = trim($data[$key] ?? '');
    if ($v === '') {
        http_response_code(422);
        header('Content-Type: application/json');
        echo json_encode(['error' => "Missing required field: {$key}"]);
        exit;
    }
    return $v;
}

function opt(array $data, string $key): ?string {
    $v = trim($data[$key] ?? '');
    return $v !== '' ? $v : null;
}

// ── Validate & extract ────────────────────────────────────────────────────────
$template_id   = req($body, 'template_id');
$business_name = req($body, 'business_name');
$phone         = req($body, 'phone');
$addr1         = req($body, 'address_line1');
$addr2         = opt($body, 'address_line2');
$city          = req($body, 'city');
$county        = opt($body, 'county_state');
$postcode      = req($body, 'postcode');
$country       = opt($body, 'country') ?? 'GB';
$email         = req($body, 'contact_email');
$domain_type   = req($body, 'domain_type'); // 'subdomain' | 'custom'
$booking       = !empty($body['booking_enabled']) ? 't' : 'f';
$hero_image    = opt($body, 'hero_image');   // filename only, e.g. 'luxury-nails-spa.jpg'

// Validate email
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

// Validate domain type
if (!in_array($domain_type, ['subdomain', 'custom'], true)) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid domain_type']);
    exit;
}

$subdomain     = null;
$custom_domain = null;

if ($domain_type === 'subdomain') {
    $subdomain = strtolower(trim($body['subdomain'] ?? ''));
    if (!preg_match('/^[a-z0-9]([a-z0-9\-]{0,48}[a-z0-9])?$/', $subdomain) || strpos($subdomain, '--') !== false) {
        http_response_code(422);
        echo json_encode(['error' => 'Invalid subdomain']);
        exit;
    }
} else {
    $custom_domain = strtolower(trim($body['custom_domain'] ?? ''));
    if ($custom_domain === '' || !preg_match('/^[a-z0-9][a-z0-9\-\.]{1,250}[a-z0-9]$/', $custom_domain)) {
        http_response_code(422);
        echo json_encode(['error' => 'Invalid custom domain']);
        exit;
    }
}

// Validate hours JSON
$hours_raw = $body['hours'] ?? null;
$days = ['sun','mon','tue','wed','thu','fri','sat'];
if (!is_array($hours_raw)) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid hours']);
    exit;
}
$hours_clean = [];
foreach ($days as $d) {
    $day_data = $hours_raw[$d] ?? [];
    $hours_clean[$d] = [
        'open'   => preg_match('/^\d{2}:\d{2}$/', $day_data['open']  ?? '') ? $day_data['open']  : '09:00',
        'close'  => preg_match('/^\d{2}:\d{2}$/', $day_data['close'] ?? '') ? $day_data['close'] : '17:00',
        'closed' => !empty($day_data['closed']),
    ];
}
$hours_json = json_encode($hours_clean);

// ── Insert ────────────────────────────────────────────────────────────────────
try {
    $pdo = launchit_db_connect();
    $pdo->beginTransaction();

    // Check subdomain availability if needed
    if ($domain_type === 'subdomain') {
        $chk = $pdo->prepare('SELECT id FROM subdomains WHERE slug = :slug FOR UPDATE');
        $chk->execute([':slug' => $subdomain]);
        if ($chk->fetch()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'subdomain_taken', 'subdomain' => $subdomain]);
            exit;
        }
    }

    // Insert submission
    $stmt = $pdo->prepare(
        'INSERT INTO onboarding_submissions
         (template_id, business_name, phone, address_line1, address_line2,
          city, county_state, postcode, country, contact_email, hours,
          booking_enabled, domain_type, subdomain, custom_domain,
          domain_payment_status, hero_image, plan, powered_by_certxa, status)
         VALUES
         (:tid, :bname, :phone, :addr1, :addr2,
          :city, :county, :postcode, :country, :email, :hours::jsonb,
          :booking, :dtype, :subdomain, :custom_domain,
          :dpay, :hero_image, :plan, TRUE, :status)
         RETURNING id'
    );

    $dpay   = $domain_type === 'custom' ? 'pending' : 'n/a';
    $status = $domain_type === 'custom' ? 'pending_payment' : 'pending';

    $stmt->execute([
        ':tid'          => $template_id,
        ':bname'        => $business_name,
        ':phone'        => $phone,
        ':addr1'        => $addr1,
        ':addr2'        => $addr2,
        ':city'         => $city,
        ':county'       => $county,
        ':postcode'     => $postcode,
        ':country'      => $country,
        ':email'        => $email,
        ':hours'        => $hours_json,
        ':booking'      => $booking,
        ':dtype'        => $domain_type,
        ':subdomain'    => $subdomain,
        ':custom_domain'=> $custom_domain,
        ':dpay'         => $dpay,
        ':hero_image'   => $hero_image,
        ':plan'         => 'free',
        ':status'       => $status,
    ]);

    $row = $stmt->fetch();
    $submission_id = (int) $row['id'];

    // Reserve subdomain
    if ($domain_type === 'subdomain') {
        $ins = $pdo->prepare('INSERT INTO subdomains (slug, submission_id) VALUES (:slug, :sid)');
        $ins->execute([':slug' => $subdomain, ':sid' => $submission_id]);
    }

    $pdo->commit();

    echo json_encode([
        'success'       => true,
        'id'            => $submission_id,
        'business_name' => $business_name,
        'domain_type'   => $domain_type,
        'subdomain'     => $subdomain,
        'custom_domain' => $custom_domain,
        'email'         => $email,
    ]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Submission failed. Please try again.', 'detail' => $e->getMessage()]);
}
