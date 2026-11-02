/* Shared by the popup and isolated content scripts. No network access. */
var SkimPrivacy = (function() {
    var patterns = [
        /\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,}/g,
        /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
        /\b(?:gh[pors]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
        /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
        /\bxox[bpars]-[0-9A-Za-z-]{10,}\b/g,
        /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g,
        /Bearer\s+[A-Za-z0-9._~+\/-]{8,}=*/gi,
        /(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token|private[_-]?key|password|passwd|pwd|card(?:[ _-]?number)?|cc[-_]number|ssn|phone|email)\s*["']?\s*[:=]\s*["']?[^\s"'<>&]{4,}/gi,
        /([?&](?:token|key|api_key|access_token|refresh_token|code|signature|sig|password|card(?:_number)?|cc[-_]number|ssn|phone|email)=)[^&#\s"'<>]+/gi,
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        /(?<![/=&])\b(?:\d[ -]?){13,19}\b/g,
        /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
        /(?<![/=&])\b(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}\b/g,
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
    ];
    function redactText(text) {
        return patterns.reduce(function(s, re) {
            re.lastIndex = 0;
            return s.replace(re, '[REDACTED]');
        }, String(text || ''));
    }
    function sensitive(text) { return redactText(text) !== String(text || ''); }
    return { patterns: patterns, redactText: redactText, sensitive: sensitive };
})();
