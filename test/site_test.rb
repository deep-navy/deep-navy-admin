# frozen_string_literal: true

site_dir, expected_environment, expected_api_origin, expected_base_path = ARGV
expected_base_path ||= ""

abort "usage: ruby test/site_test.rb SITE_DIR ENVIRONMENT API_ORIGIN" unless expected_api_origin

index_path = File.join(site_dir, "index.html")
robots_path = File.join(site_dir, "robots.txt")
stylesheet_path = File.join(site_dir, "assets", "css", "admin.css")
script_path = File.join(site_dir, "assets", "js", "admin.js")

[index_path, robots_path, stylesheet_path, script_path].each do |path|
  abort "missing build output: #{path}" unless File.file?(path)
end

html = File.read(index_path)
robots = File.read(robots_path)

expectations = {
  "environment marker" => %(data-environment="#{expected_environment}"),
  "API origin" => expected_api_origin,
  "noindex policy" => %(name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex"),
  "content security policy" => %(http-equiv="Content-Security-Policy"),
  "skip link" => %(class="skip-link"),
  "health section" => %(id="health"),
  "operations section" => %(id="operations"),
  "customers section" => %(id="customers"),
  "billing section" => %(id="billing"),
  "honest disconnected state" => "Not connected",
  "authentication warning" => "Privileged access is not connected",
  "stylesheet base path" => %(href="#{expected_base_path}/assets/css/admin.css"),
  "script base path" => %(src="#{expected_base_path}/assets/js/admin.js")
}

expectations.each do |label, expected|
  abort "#{label} missing from #{index_path}" unless html.include?(expected)
end

abort "robots.txt must disallow all crawlers" unless robots.match?(/User-agent:\s*\*.*Disallow:\s*\//m)

forbidden_origin = expected_environment == "production" ? "https://api.dev.deep.navy" : 'data-environment="production"'
abort "environment configuration leaked into #{expected_environment} build" if html.include?(forbidden_origin)

puts "validated #{expected_environment} build at #{site_dir}"
