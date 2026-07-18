#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "open3"
require "rbconfig"
require "tmpdir"

script = File.expand_path("../scripts/write_runtime_config.rb", __dir__)
base_environment = {
  "DEEP_NAVY_ENVIRONMENT" => "development",
  "ADMIN_URL" => "https://dev.admin.deep.navy",
  "ADMIN_API_BASE_URL" => "https://dev.api.deep.navy",
  "ADMIN_COGNITO_DOMAIN" => "https://deep-navy-dev.auth.us-west-2.amazoncognito.com",
  "ADMIN_COGNITO_ISSUER" => "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_example",
  "ADMIN_COGNITO_CLIENT_ID" => "publicclientid123",
  "ADMIN_SESSION_MAX_AGE_SECONDS" => "900",
  "GITHUB_SHA" => "fa01d7cc4c68c1e7ee606a44677ad70d16f4c563"
}.freeze

def run_writer(script, environment)
  Dir.mktmpdir("deep-navy-admin-runtime") do |directory|
    output = File.join(directory, "runtime.json")
    stdout, stderr, status = Open3.capture3(environment, RbConfig.ruby, script, output, chdir: directory, unsetenv_others: true)
    return [stdout, stderr, status, File.file?(output) ? JSON.parse(File.read(output)) : nil]
  end
end

_stdout, stderr, status, configuration = run_writer(script, base_environment)
abort "valid runtime configuration failed: #{stderr}" unless status.success?
runtime = configuration.fetch("runtime")
abort "API origin changed" unless runtime.fetch("api_base_url") == "https://dev.api.deep.navy"
abort "issuer changed" unless runtime.fetch("cognito_issuer").end_with?("/us-west-2_example")
abort "callback is not derived from the deployed admin site" unless runtime.fetch("cognito_callback_url") == "https://dev.admin.deep.navy/auth/callback/"
abort "logout URL is not the deployed admin root" unless runtime.fetch("cognito_logout_url") == "https://dev.admin.deep.navy/"
abort "unexpected site URL" unless configuration.fetch("url") == "https://dev.admin.deep.navy"
abort "unexpected site base path" unless configuration.fetch("baseurl") == ""
abort "admin session ceiling changed" unless runtime.fetch("session_max_age_seconds") == 900

invalid_cases = {
  "CSP-like API injection" => { "ADMIN_API_BASE_URL" => "https://dev.api.deep.navy; script-src *" },
  "site URL credentials" => { "ADMIN_URL" => "https://user@dev.admin.deep.navy" },
  "site URL query" => { "ADMIN_URL" => "https://dev.admin.deep.navy?preview=true" },
  "malformed site path" => { "ADMIN_URL" => "https://dev.admin.deep.navy//deep-navy-admin" },
  "issuer query" => { "ADMIN_COGNITO_ISSUER" => "https://cognito-idp.us-west-2.amazonaws.com/pool?x=1" },
  "issuer root" => { "ADMIN_COGNITO_ISSUER" => "https://cognito-idp.us-west-2.amazonaws.com" },
  "long browser session" => { "ADMIN_SESSION_MAX_AGE_SECONDS" => "901" },
  "unknown environment" => { "DEEP_NAVY_ENVIRONMENT" => "staging" },
  "partial deployment config" => { "ADMIN_COGNITO_CLIENT_ID" => "" }
}

invalid_cases.each do |name, override|
  _invalid_stdout, _invalid_stderr, invalid_status, invalid_configuration = run_writer(script, base_environment.merge(override))
  abort "#{name} was accepted" if invalid_status.success? || invalid_configuration
end

puts "Runtime configuration accepts only complete, normalized public admin coordinates."
