<#import "password-policy.ftl" as pw>
<#--
  Field errors are shown under their own inputs. Keycloak's user profile reports
  a missing name as the generic "Please specify this field.", so for the name
  fields that is swapped for Keycloak's own field-specific message.
-->
<#macro fieldError field requiredMessage="">
  <#if messagesPerField.existsError(field)>
    <#local error = messagesPerField.get(field)>
    <p class="wh-field-error"><#if requiredMessage?has_content && error == msg("error-user-attribute-required")>${msg(requiredMessage)}<#else>${kcSanitize(error)?no_esc}</#if></p>
  </#if>
</#macro>
<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Create Account — Stocdup</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
  <link rel="icon" href="${url.resourcesPath}/img/favicon.ico">
</head>
<body>

  <div class="wh-card">

    <div class="wh-header">
      <div class="wh-wordmark">
        <img src="${url.resourcesPath}/img/stocdup-logo-only.png" alt="" class="wh-logo" />
        <span class="wh-title">stocd<span class="wh-title-accent">up</span></span>
      </div>
      <p class="wh-subtitle">Create Account</p>
      <div class="wh-divider"></div>
    </div>

    <#--
      The summary is every message joined with <br>, field errors included. Drop
      the lines already shown under a field on this form; anything else (global
      errors, errors on attributes this form has no input for) stays visible.
    -->
    <#if message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
      <#assign shownUnderFields = []>
      <#list ['firstName', 'lastName', 'email', 'username', 'password', 'password-confirm'] as field>
        <#if messagesPerField.exists(field)>
          <#assign shownUnderFields = shownUnderFields + messagesPerField.get(field)?split("<br>")>
        </#if>
      </#list>
      <#assign bannerLines = message.summary?split("<br>")?filter(line -> !shownUnderFields?seq_contains(line))>
      <#if bannerLines?has_content>
        <p class="wh-<#if message.type = 'error'>error<#else>info</#if>">${kcSanitize(bannerLines?join("<br>"))?no_esc}</p>
      </#if>
    </#if>

    <form id="kc-register-form" action="${url.registrationAction}" method="post">

      <div class="wh-row">
        <div class="wh-field">
          <label for="firstName">First name</label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            value="${(register.formData.firstName)!''}"
            autocomplete="given-name"
            autofocus
          />
          <@fieldError field="firstName" requiredMessage="missingFirstNameMessage"/>
        </div>
        <div class="wh-field">
          <label for="lastName">Last name</label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            value="${(register.formData.lastName)!''}"
            autocomplete="family-name"
          />
          <@fieldError field="lastName" requiredMessage="missingLastNameMessage"/>
        </div>
      </div>

      <div class="wh-field">
        <label for="email">Work email</label>
        <input
          type="email"
          id="email"
          name="email"
          value="${(register.formData.email)!''}"
          autocomplete="email"
          placeholder="you@yourbusiness.com"
        />
        <#-- The email is the username here, so a username error belongs to this field (email's own error wins). -->
        <#if messagesPerField.existsError('email', 'username')>
          <p class="wh-field-error">${kcSanitize(messagesPerField.getFirstError('email', 'username'))?no_esc}</p>
        </#if>
      </div>

      <#if passwordRequired??>
        <div class="wh-field">
          <label for="password">Password</label>
          <div class="wh-pw-wrap">
            <input
              type="password"
              id="password"
              name="password"
              autocomplete="new-password"
              placeholder="••••••••"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
              <#if passwordPolicies??>aria-describedby="kc-password-policy-list"</#if>
            />
            <@pw.eyeToggle/>
          </div>
          <@pw.progress/>
          <@pw.policyList passwordField="password" confirmField="password-confirm" emailField="#email" usernameField="#email"/>
          <#if messagesPerField.existsError('password')>
            <p class="wh-field-error">${kcSanitize(messagesPerField.get('password'))?no_esc}</p>
          </#if>
        </div>

        <div class="wh-field wh-field--last">
          <label for="password-confirm">Confirm password</label>
          <div class="wh-pw-wrap">
            <input
              type="password"
              id="password-confirm"
              name="password-confirm"
              autocomplete="new-password"
              placeholder="••••••••"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
              aria-describedby="pw-match"
            />
            <@pw.eyeToggle label="confirm password"/>
          </div>
          <@pw.matchLine/>
          <#if messagesPerField.existsError('password-confirm')>
            <p class="wh-field-error">${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}</p>
          </#if>
        </div>
      </#if>

      <button class="wh-btn" type="submit">
        Create Account
      </button>

    </form>

    <a class="wh-link" href="${url.loginUrl}">Already have an account? Sign in</a>

  </div>

  <script type="module" src="${url.resourcesPath}/js/password-rules.js"></script>

</body>
</html>
