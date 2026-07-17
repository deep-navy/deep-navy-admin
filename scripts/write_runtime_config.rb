#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "pathname"
require "uri"

def public_value(name)
  ENV.fetch(name, "").strip
end

def local_http?(uri)
  uri.scheme == "http" && ["localhost", "127.0.0.1", "::1"].include?(uri.host)
end

def public_origin(name)
  value = public_value(name)
  return "" if value.empty?

  uri = URI.parse(value)
  valid = (uri.scheme == "https" || local_http?(uri)) && uri.host && !uri.user && !uri.password &&
    !uri.query && !uri.fragment && ["", "/"].include?(uri.path)
  abort "#{name} must be an HTTPS origin without credentials, path, query, or fragment" unless valid
  value.delete_suffix("/")
rescue URI::InvalidURIError
  abort "#{name} must be a valid HTTPS origin"
end

def public_site_url(name)
  value = public_value(name)
  return ["", ""] if value.empty?

  uri = URI.parse(value)
  path = uri.path.to_s
  normalized_path = path == "/" ? "" : path
  segments = normalized_path.delete_prefix("/").split("/", -1)
  valid_path = normalized_path.empty? || (
    normalized_path.start_with?("/") &&
    !normalized_path.end_with?("/") &&
    !segments.any? { |segment| segment.empty? || [".", ".."].include?(segment) } &&
    !normalized_path.match?(/%2f|%5c|\\/i)
  )
  valid = (uri.scheme == "https" || local_http?(uri)) && uri.host && !uri.user && !uri.password &&
    !uri.query && !uri.fragment && valid_path
  abort "#{name} must be an HTTPS site URL with a normalized optional path" unless valid

  origin = uri.dup
  origin.path = ""
  [origin.to_s, normalized_path]
rescue URI::InvalidURIError
  abort "#{name} must be a valid HTTPS site URL"
end

def public_issuer(name)
  value = public_value(name)
  return "" if value.empty?

  uri = URI.parse(value)
  path = uri.path.to_s.delete_suffix("/")
  segments = path.delete_prefix("/").split("/", -1)
  valid_path = path.start_with?("/") && path.length > 1 && !segments.any? { |segment| segment.empty? || [".", ".."].include?(segment) }
  valid = (uri.scheme == "https" || local_http?(uri)) && uri.host && !uri.user && !uri.password &&
    !uri.query && !uri.fragment && valid_path
  abort "#{name} must be an HTTPS issuer URL with a normalized non-root path" unless valid
  "#{uri.scheme}://#{uri.host}#{uri.port && ![80, 443].include?(uri.port) ? ":#{uri.port}" : ""}#{path}"
rescue URI::InvalidURIError
  abort "#{name} must be a valid HTTPS issuer URL"
end

environment = public_value("DEEP_NAVY_ENVIRONMENT")
environment = "local" if environment.empty?
abort "DEEP_NAVY_ENVIRONMENT must be local, development, or production" unless %w[local development production].include?(environment)

site_origin, site_base_path = public_site_url("ADMIN_URL")
api_base_url = public_origin("ADMIN_API_BASE_URL")
cognito_domain = public_origin("ADMIN_COGNITO_DOMAIN")
cognito_issuer = public_issuer("ADMIN_COGNITO_ISSUER")
cognito_client_id = public_value("ADMIN_COGNITO_CLIENT_ID")
unless cognito_client_id.empty? || cognito_client_id.match?(/\A[a-zA-Z0-9]{1,128}\z/)
  abort "ADMIN_COGNITO_CLIENT_ID must be a public Cognito app-client identifier"
end

session_max_age = public_value("ADMIN_SESSION_MAX_AGE_SECONDS")
session_max_age = "900" if session_max_age.empty?
abort "ADMIN_SESSION_MAX_AGE_SECONDS must be a whole number from 300 through 900" unless session_max_age.match?(/\A[0-9]+\z/) && session_max_age.to_i.between?(300, 900)

if environment != "local"
  missing = {
    "ADMIN_URL" => site_origin,
    "ADMIN_API_BASE_URL" => api_base_url,
    "ADMIN_COGNITO_DOMAIN" => cognito_domain,
    "ADMIN_COGNITO_ISSUER" => cognito_issuer,
    "ADMIN_COGNITO_CLIENT_ID" => cognito_client_id
  }.select { |_name, value| value.empty? }.keys
  abort "deployment configuration is incomplete: #{missing.join(', ')}" unless missing.empty?
end

site_root = site_origin.empty? ? "" : "#{site_origin}#{site_base_path}/"
runtime = {
  "environment" => environment,
  "environment_label" => environment.capitalize,
  "api_base_url" => api_base_url,
  "cognito_domain" => cognito_domain,
  "cognito_issuer" => cognito_issuer,
  "cognito_client_id" => cognito_client_id,
  "cognito_callback_url" => site_root.empty? ? "" : "#{site_root}auth/callback/",
  "cognito_logout_url" => site_root,
  "oauth_scopes" => %w[openid email profile],
  "session_max_age_seconds" => session_max_age.to_i,
  "build_revision" => public_value("GITHUB_SHA").then { |value| value.empty? ? "local" : value[0, 12] }
}
configuration = { "runtime" => runtime }
unless site_origin.empty?
  configuration["url"] = site_origin
  configuration["baseurl"] = site_base_path
end

output = Pathname(ARGV.fetch(0, "_config.runtime.yml")).expand_path
output.dirname.mkpath
output.write(JSON.pretty_generate(configuration) + "\n", mode: "w", encoding: "UTF-8")
