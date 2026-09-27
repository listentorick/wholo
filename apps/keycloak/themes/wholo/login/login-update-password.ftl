<#import "password-policy.ftl" as pw>
<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>New Password — Stocdup</title>
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
      <p class="wh-subtitle">New Password</p>
      <div class="wh-divider"></div>
    </div>

    <#if message?has_content>
      <p class="wh-error">${kcSanitize(message.summary)}</p>
    </#if>

    <form id="kc-passwd-update-form" action="${url.loginAction}" method="post">

      <input type="hidden" id="username" name="username" value="${(auth.attemptedUsername)!''}" autocomplete="username" />

      <div class="wh-field">
        <label for="password-new">New Password</label>
        <div class="wh-pw-wrap">
          <input
            type="password"
            id="password-new"
            name="password-new"
            autocomplete="new-password"
            placeholder="••••••••"
            autofocus
            <#if passwordPolicies??>aria-describedby="kc-password-policy-list"</#if>
          />
          <@pw.eyeToggle/>
        </div>
        <@pw.progress/>
        <#-- The hidden #username holds the email when registrationEmailAsUsername is on. -->
        <@pw.policyList passwordField="password-new" confirmField="password-confirm" emailField=((realm.registrationEmailAsUsername)!false)?then("#username", "") usernameField="#username"/>
      </div>

      <div class="wh-field wh-field--last">
        <label for="password-confirm">Confirm Password</label>
        <div class="wh-pw-wrap">
          <input
            type="password"
            id="password-confirm"
            name="password-confirm"
            autocomplete="new-password"
            placeholder="••••••••"
            aria-describedby="pw-match"
          />
          <@pw.eyeToggle label="confirm password"/>
        </div>
        <@pw.matchLine/>
      </div>

      <button class="wh-btn" type="submit">
        Update Password
      </button>

    </form>

  </div>

  <script type="module" src="${url.resourcesPath}/js/password-rules.js"></script>

</body>
</html>
