<#--
  Password-policy UI shared by register.ftl and login-update-password.ftl.
  Renders a plain hint list; resources/js/password-rules.js upgrades it into a
  live checklist (ticks each rule as it is met). Keycloak's server-side policy
  stays the only authority — without JS the page is a static list as before.
-->

<#macro icons>
<span class="wh-rule-icon" aria-hidden="true">
  <svg class="wh-i-todo" width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="#B6BCC6" stroke-width="1.5"/></svg>
  <svg class="wh-i-met" width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.25" fill="#16A34A"/><path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <svg class="wh-i-err" width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="#DC2626" stroke-width="1.5"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="#DC2626" stroke-width="1.5" stroke-linecap="round"/></svg>
</span>
</#macro>

<#macro rule name min="" max="" against="">
<li class="wh-rule" data-rule="${name}"<#if min?has_content> data-min="${min}"</#if><#if max?has_content> data-max="${max}"</#if><#if against?has_content> data-against="${against}"</#if>><@icons/><span class="wh-sr wh-rule-status"></span><#nested></li>
</#macro>

<#-- Show/hide toggle for the input in the same .wh-pw-wrap; the script reveals it (hidden without JS). -->
<#macro eyeToggle label="password">
<button type="button" class="wh-eye" aria-label="Show ${label}" aria-pressed="false" data-label="${label}" hidden>
  <svg class="wh-eye-show" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
  <svg class="wh-eye-hide" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
</button>
</#macro>

<#-- Progress track under the password input; replaces its underline when live. -->
<#macro progress>
<div class="wh-pw-progress" hidden><span class="wh-pw-progress-fill"></span></div>
</#macro>

<#-- "Passwords match" line under the confirm input. -->
<#macro matchLine>
<p class="wh-match" id="pw-match" hidden><@icons/><span class="wh-match-text"></span></p>
</#macro>

<#--
  passwordField / confirmField: ids of the two inputs.
  emailField / usernameField: CSS selectors of inputs holding the user's email /
  username on this page ("" when the page has none — that rule is then only
  checked by the server). With registrationEmailAsUsername the two checks are
  the same thing, so notUsername is shown as the email rule.
-->
<#macro policyList passwordField confirmField emailField="" usernameField="">
<#if passwordPolicies??>
<#assign emailAsUsername = (realm.registrationEmailAsUsername)!false>
<ul class="wh-field-hint" id="kc-password-policy-list" data-password-field="${passwordField}" data-confirm-field="${confirmField}">
  <#if (passwordPolicies.length!-1) != -1><@rule name="length" min=passwordPolicies.length?c>At least ${passwordPolicies.length} characters</@rule></#if>
  <#if (passwordPolicies.maxLength!-1) != -1><@rule name="maxLength" max=passwordPolicies.maxLength?c>At most ${passwordPolicies.maxLength} characters</@rule></#if>
  <#if (passwordPolicies.upperCase!-1) != -1><@rule name="upperCase" min=passwordPolicies.upperCase?c>At least ${passwordPolicies.upperCase} upper case letter<#if passwordPolicies.upperCase != 1>s</#if></@rule></#if>
  <#if (passwordPolicies.lowerCase!-1) != -1><@rule name="lowerCase" min=passwordPolicies.lowerCase?c>At least ${passwordPolicies.lowerCase} lower case letter<#if passwordPolicies.lowerCase != 1>s</#if></@rule></#if>
  <#if (passwordPolicies.digits!-1) != -1><@rule name="digits" min=passwordPolicies.digits?c>At least ${passwordPolicies.digits} number<#if passwordPolicies.digits != 1>s</#if></@rule></#if>
  <#if (passwordPolicies.specialChars!-1) != -1><@rule name="specialChars" min=passwordPolicies.specialChars?c>At least ${passwordPolicies.specialChars} special character<#if passwordPolicies.specialChars != 1>s</#if></@rule></#if>
  <#if passwordPolicies.notUsername && !emailAsUsername><@rule name="notUsername" against=usernameField>Must not be your username</@rule></#if>
  <#if passwordPolicies.notEmail || (passwordPolicies.notUsername && emailAsUsername)><@rule name="notEmail" against=emailField>Must not be your email address</@rule></#if>
</ul>
<p class="wh-sr" id="pw-live" aria-live="polite"></p>
</#if>
</#macro>
