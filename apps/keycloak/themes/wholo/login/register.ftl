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

    <#if message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
      <p class="wh-<#if message.type = 'error'>error<#else>info</#if>">${kcSanitize(message.summary)?no_esc}</p>
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
          <#if messagesPerField.existsError('firstName')>
            <p class="wh-field-error">${kcSanitize(messagesPerField.get('firstName'))?no_esc}</p>
          </#if>
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
          <#if messagesPerField.existsError('lastName')>
            <p class="wh-field-error">${kcSanitize(messagesPerField.get('lastName'))?no_esc}</p>
          </#if>
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
        <#if messagesPerField.existsError('email')>
          <p class="wh-field-error">${kcSanitize(messagesPerField.get('email'))?no_esc}</p>
        </#if>
      </div>

      <#if passwordRequired??>
        <div class="wh-field">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            autocomplete="new-password"
            placeholder="••••••••"
          />
          <#if messagesPerField.existsError('password')>
            <p class="wh-field-error">${kcSanitize(messagesPerField.get('password'))?no_esc}</p>
          </#if>
        </div>

        <div class="wh-field wh-field--last">
          <label for="password-confirm">Confirm password</label>
          <input
            type="password"
            id="password-confirm"
            name="password-confirm"
            autocomplete="new-password"
            placeholder="••••••••"
          />
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

</body>
</html>
