# frozen_string_literal: true

require "pathname"

site_dir, expected_environment, expected_api_origin, expected_base_path = ARGV
expected_base_path ||= ""
abort "usage: ruby test/site_test.rb SITE_DIR ENVIRONMENT API_ORIGIN [BASE_PATH]" unless expected_api_origin

site = Pathname(site_dir).expand_path
index_path = site.join("index.html")
callback_path = site.join("auth", "callback", "index.html")
robots_path = site.join("robots.txt")
stylesheet_path = site.join("assets", "css", "admin.css")
admin_script_path = site.join("assets", "js", "admin.js")
client_script_path = site.join("assets", "js", "admin-api-client.js")
runtime_script_path = site.join("assets", "js", "runtime-config.js")

# The design system is vendored under assets/css/ds/ and must reach the build intact:
# ds.css is only an @import manifest, so a missing file under it fails silently as an
# unstyled console rather than as a build error.
design_system_paths = %w[
  tokens/palette tokens/typography tokens/space tokens/breakpoints tokens/shape
  tokens/motion tokens/semantic tokens/roles tokens/base
  components/components components/core/core components/core/icons-motion components/forms/forms
  components/navigation/navigation components/feedback/feedback components/notify/notify
  components/data/data components/agents/agents components/motion/motion
].map { |name| site.join("assets", "css", "ds", "#{name}.css") }
# The site-local layers the system deliberately leaves to the site — plus icon-motion,
# which re-points the vendored icon-motion selectors at this console's sprite DOM. Miss it
# and every icon still renders, and none of them move.
layer_paths = %w[ds type theme icon-motion].map { |name| site.join("assets", "css", "#{name}.css") }
theme_script_path = site.join("assets", "js", "theme.js")
icon_motion_script_path = site.join("assets", "js", "icon-motion.js")
# The severity ladder. Miss it and every callout in the console renders achromatic
# while looking otherwise correct, which is a silent failure of the one table that
# says how loud a thing is.
notice_levels_script_path = site.join("assets", "js", "notice-levels.js")
font_paths = %w[bricolage-grotesque.woff2 instrument-sans.woff2 jetbrains-mono.woff2 FONTS-LICENSE.md].map { |name| site.join("assets", "fonts", name) }

[index_path, callback_path, robots_path, stylesheet_path, admin_script_path, client_script_path, runtime_script_path,
 theme_script_path, icon_motion_script_path, notice_levels_script_path, *layer_paths, *design_system_paths, *font_paths].each do |path|
  abort "missing build output: #{path}" unless path.file?
end

index_html = index_path.read
callback_html = callback_path.read
robots = robots_path.read
runtime = runtime_script_path.read

expectations = {
  "environment marker" => %(data-environment="#{expected_environment}"),
  "API origin" => expected_api_origin,
  "noindex policy" => %(name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex"),
  "content security policy" => %(http-equiv="Content-Security-Policy"),
  "no-referrer policy" => %(name="referrer" content="no-referrer"),
  "skip link" => %(class="skip-link"),
  "overview" => %(id="overview"),
  "customers" => %(id="customers"),
  "customer detail" => %(id="customer-detail"),
  "customer reliability history" => %(data-customer-reliability-rows),
  "economics" => %(id="economics"),
  "operations" => %(id="operations"),
  "billing" => %(id="billing"),
  "billing upgrades" => %(data-billing-metric="upgrades"),
  "billing downgrades" => %(data-billing-metric="downgrades"),
  "usage overage credits" => "Overage credits",
  "usage overage premium" => "Overage premium",
  "server authorization statement" => "The UI is not the authorization boundary",
  "privileged-control honesty" => "Privileged controls stay unavailable until they are auditable",
  "metrics explorer" => %(data-metrics-grid),
  "metrics query echo" => %(data-metrics-query-echo),
  "audit surface" => %(id="audit"),
  "view routing" => %(data-view-link="overview"),
  "bottom tab bar" => %(class="dn-tabbar"),
  "session policy" => "Signs out at",
  "self-hosted font policy" => "font-src 'self'",
  "vendored design system" => %(href="#{expected_base_path}/assets/css/ds.css"),
  "self-hosted faces" => %(href="#{expected_base_path}/assets/css/type.css"),
  "theme layer" => %(href="#{expected_base_path}/assets/css/theme.css"),
  "pre-paint theme script" => %(src="#{expected_base_path}/assets/js/theme.js"),
  "generated client" => %(src="#{expected_base_path}/assets/js/admin-api-client.js"),
  "stylesheet base path" => %(href="#{expected_base_path}/assets/css/admin.css"),
  "application script" => %(src="#{expected_base_path}/assets/js/admin.js"),
  "severity ladder" => %(src="#{expected_base_path}/assets/js/notice-levels.js")
}
expectations.each do |label, expected|
  abort "#{label} missing from #{index_path}" unless index_html.include?(expected)
end

[index_html, callback_html].each do |html|
  abort "authenticated pages must not contain inline script" if html.match?(%r{<script(?![^>]*\ssrc=)[^>]*>}i)
  abort "authenticated pages must prohibit form submission" unless html.include?("form-action 'none'")
  scrubber = html.index("callback-scrubber.js")
  runtime_config = html.index("runtime-config.js")
  generated_client = html.index("admin-api-client.js")
  notice_levels = html.index("notice-levels.js")
  application = html.index("assets/js/admin.js")
  abort "security-sensitive script order is invalid" unless scrubber && runtime_config && generated_client && application && scrubber < runtime_config && runtime_config < generated_client && generated_client < application
  abort "the severity ladder must load before the console reads it" unless notice_levels && notice_levels < application
end

# style-src 'self' refuses style ATTRIBUTES as well as <style> blocks, so an inline
# style silently does nothing while looking correct in the source. That is how a bar
# ships frozen at zero. The console must not contain one.
[index_html, callback_html].each do |html|
  next unless html.match?(%r{style-src 'self'}) && !html.match?(%r{style-src[^;]*'unsafe-inline'})

  abort "inline style attribute is blocked by this page's style-src 'self'; use a class" if html.match?(%r{\sstyle="})
end

# The vendored system must be linked BEFORE the site-local layers that re-derive its
# tokens, or the chroma boost and the OS-preference default lose the cascade.
ds_at = index_html.index("/assets/css/ds.css")
type_at = index_html.index("/assets/css/type.css")
theme_at = index_html.index("/assets/css/theme.css")
admin_at = index_html.index("/assets/css/admin.css")
unless ds_at && type_at && theme_at && admin_at && ds_at < type_at && type_at < theme_at && theme_at < admin_at
  abort "stylesheet order is invalid: ds.css, type.css, theme.css, admin.css"
end

abort "callback marker missing" unless callback_html.include?(%(data-auth-callback="true"))
abort "callback code must never be rendered into HTML" if callback_html.match?(/one-time-code|authorization_code/i)
abort "robots.txt must disallow all crawlers" unless robots.match?(/User-agent:\s*\*.*Disallow:\s*\//m)
abort "runtime environment missing" unless runtime.include?(%("environment":"#{expected_environment}")) || runtime.include?(%("environment":"#{expected_environment}"))
abort "runtime config must not contain a secret field" if runtime.match?(/client_secret|private_key|api_key|stripe_secret|access_token|refresh_token/i)

forbidden_origin = expected_environment == "production" ? "https://dev.api.deep.navy" : '"environment":"production"'
abort "environment configuration leaked into #{expected_environment} build" if index_html.include?(forbidden_origin) || runtime.include?(forbidden_origin)

puts "validated protected #{expected_environment} admin build at #{site}"
