---
name: wf-opc-connector-workflow
description: "Step-by-step guide to set up, secure and debug a SkySpark OPC UA connector (opcConn), including certificate trust..."
---

<!-- generated from workflows/opcConnectorWorkflow.md by claudePlugin/scripts/build.mjs; edit the source, not this file -->

# OPC UA Connector Workflow

## Overview

Use this workflow to set up a SkySpark OPC UA connector (`opcConn`), or to fix one that shows `status: fault`.

The connector opens in four steps. After it is open, browsing the tree can fail on its own. Each step has its own errors:

| Step | What happens | Code in the stack trace | Typical error | Fix |
| --- | --- | --- | --- | --- |
| 1. Endpoint match | SkySpark reads the server's endpoint list and picks one that matches `uri` + `opcSecurity` | `OpcDispatch.onOpen (OpcDispatch.fan:65)` | `haystack::FaultErr: No matching endpoint` | [Fix A](#fix-a-no-matching-endpoint-step-1-endpoint-match) |
| 2. Secure channel | TCP connect, then certificate exchange | `TcpSecureChannel.open` | `0x80130000 BadSecurityChecksFailed`, then `0x80ae0000 BadConnectionClosed` | [Fix B](#fix-b-badsecuritychecksfailed-step-2-secure-channel) |
| 3. Create session | Session opens on the chosen endpoint | `Session.openSession` | `BadSecurityPolicyRejected` | [Fix D](#fix-d-other-errors) |
| 4. Activate session | Login (Anonymous or UserName) | `Session.onActivate` | `sys::UnsupportedErr` in `AsymNone.encrypt`, `BadIdentityTokenRejected`, `BadUserAccessDenied` | [Fix C](#fix-c-unsupportederr-in-asymnoneencrypt-step-4-login) |
| After open | Browse (learn) the server tree | `navMod::ConnLearnPlan`, `BrowseRequest` | `0x800a0000 BadTimeout` | [Fix E](#fix-e-browserequest-timeout-while-learning) |

Find the step first. The step tells you where to look. Fixing one step often shows the next error. That is progress, not a new problem.

## When to Use This Workflow

Run this workflow when the user says things like:

- "OPC connector is in fault"
- "opcConn won't connect"
- "BadSecurityChecksFailed" / "network connection has been closed"
- "No matching endpoint"
- "UnsupportedErr AsymNone"
- "BrowseRequest timed out" / "0x800a0000" when expanding the tree
- "can't see real points, only Simulation"
- "set up an OPC UA connector"
- "Matrikon OPC" / "UA Wrapper" / "UA Tunneller" / "Kepware"

## Prerequisites

1. **Active project.** Set it before you run Axon:
   ```
   mcp__axon-mcp__setPrimaryProject(instanceName="<inst>", projectName="<proj>")
   ```
2. **The OPC library is on.** `lib-opc` (SkySpark 3.1: `hxOpc::OpcLib`) must be enabled in the project.
3. **Admin rights.** `opcGenCert`, `connPing` and record edits need an admin user.
4. **Access to the OPC server PC.** You need it to trust the SkySpark certificate.
5. **The server speaks OPC UA.** SkySpark supports only `opc.tcp://`. Classic Matrikon servers speak only OPC DA. They need a UA layer in front: Matrikon OPC UA Tunneller (UA Proxy), UA Wrapper or Data Broker.

## Reference: Connector Tags

| Tag | Kind | Meaning |
| --- | --- | --- |
| `opcConn` | Marker | Marks the record as an OPC UA connector. |
| `conn` | Marker | Marks the record as a connector. |
| `dis` | Str | Display name. |
| `uri` | Uri | Endpoint URL, for example `` `opc.tcp://fmskyspark:21381/MatrikonOpcUaWrapper` ``. Only `opc.tcp` works. Use the exact host the server reports in its endpoint list, not `localhost` or an IP (see Fix A). |
| `opcSecurity` | Str | Security policy and mode. See the table below. |
| `opcCertAlias` | Str | Alias of the client cert in the SkySpark crypto store. Default: `opc.default`. Needed if `opcSecurity` is not `None`. |
| `opcUserAuthMode` | Str | `Anonymous` (default) or `UserName`. |
| `username` | Str | Login name for `UserName` mode. |
| `password` | (password store) | Set with `passwordSet()`. Never put it on the record as a plain Str. |

Supported `opcSecurity` values:

```
None
Basic128Rsa15 Sign
Basic128Rsa15 SignAndEncrypt
Basic256 Sign
Basic256 SignAndEncrypt
Basic256Sha256 Sign
Basic256Sha256 SignAndEncrypt
```

Use `Basic256Sha256 SignAndEncrypt` when the server supports it. The `Basic128Rsa15` and `Basic256` policies are old and many servers turn them off.

> **Note on docs.** The 3.1.11 `opcConn` tag page says only anonymous login is supported and that `username`/`password` are ignored. The main lib-opc page and the 3.1.9 stack trace (`UserNameIdentityToken`) show that `UserName` mode works. Trust the stack trace.

## Reference: Point Tags

| Tag | Use |
| --- | --- |
| `opcPoint` | Marker for a point that syncs via OPC. |
| `opcConnRef` | Ref to the parent `opcConn`. |
| `opcCur` | NodeId to read the current value. |
| `opcHis` | NodeId to read history from the server. |
| `opcWrite` | NodeId to write to. |
| `opcType` | NodeId of the OPC data type, for example `i=4` for Int16. |

NodeId forms:

```
ns=3;s=Test.Point     string in namespace 3
ns=15;i=2459          integer in namespace 15
i=348                 integer in namespace 0
ns=1;b=YmxvYg==       bytestring (base64)
ns=7;g=03f0e2bb-...   uuid
```

`UInt64` (`i=9`) is not supported.

## Reference: Axon Functions

| Function | Use |
| --- | --- |
| `connPing(conn)` | Try to open the connector. Returns a future. |
| `connDetails(conn)` | Plain-text debug details, including the last error. |
| `connLearn(conn, arg)` | Browse the server tree. |
| `connTraceEnable(conn)` / `connTrace(conn)` / `connTraceDisable(conn)` | Turn on, read and turn off the message trace. |
| `connSyncCur(points)` / `connSyncHis(points, span)` | Force a sync of current values or history. |
| `opcGenCert(subject, alias)` | Make a new self-signed client cert. |

`opcPing`, `opcSyncCur` and `opcSyncHis` are deprecated. Use the `conn*` functions.

---

## Step 1: Find the Connector

```axon
readAll(opcConn).map(r => {
  id: r->id.toStr,
  dis: r.dis,
  uri: r["uri"],
  opcSecurity: r["opcSecurity"],
  opcCertAlias: r["opcCertAlias"],
  opcUserAuthMode: r["opcUserAuthMode"],
  username: r["username"],
  connStatus: r["connStatus"],
  connErr: r["connErr"]
})
```

Write down the `id`. The steps below use `@connId`.

## Step 2: Read the Error

```axon
connDetails(@connId)
```

Look at the `err:` block. Read the stack from the **bottom up**. Use the table in the Overview to find the step that failed, then go to the matching fix below.

---

## Fix A: `No matching endpoint` (step 1, endpoint match)

**Trace looks like:**

```
haystack::FaultErr: No matching endpoint
[EndpointDescription [
  EndpointUrl: opc.tcp://fmskyspark:21381/MatrikonOpcUaWrapper
  SecurityMode: Sign
  SecurityPolicyUri: http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256
  ...
], EndpointDescription [
  EndpointUrl: opc.tcp://fmskyspark:21381/MatrikonOpcUaWrapper
  SecurityMode: SignAndEncrypt
  SecurityPolicyUri: http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256
  ...
]]
  hxOpc::OpcDispatch.onOpen (OpcDispatch.fan:65)
```

**Meaning:** SkySpark asked the server for its endpoint list and none of them matched the connector. The error prints the full list, so read it: it tells you exactly what the server offers.

**Causes, most likely first:**

1. **The `uri` host is not the host the server reports.** `localhost`, an IP address, or another alias may not match `fmskyspark`, even when they reach the same machine. In the real case below, changing `uri` from `localhost` to `fmskyspark` fixed this error. So SkySpark appears to compare the endpoint URL as well as the policy. This was not confirmed in the hxOpc source.
2. **`opcSecurity` is a policy/mode the server does not offer.** For example `None` when the list has only `Basic256Sha256 Sign` and `SignAndEncrypt`.

**Fix:**

1. Copy the `EndpointUrl` from the error into `uri`, exactly (same host name, port and path).
2. Set `opcSecurity` to one of the listed `SecurityPolicyUri` + `SecurityMode` pairs. Prefer the one with the highest `SecurityLevel`.

```axon
commit(diff(readById(@connId), {
  uri: `opc.tcp://fmskyspark:21381/MatrikonOpcUaWrapper`,
  opcSecurity: "Basic256Sha256 SignAndEncrypt",
  opcCertAlias: "opc.default"
}))
connPing(@connId)
```

If the SkySpark host cannot resolve the server's host name, add it to `C:\Windows\System32\drivers\etc\hosts` (for example `127.0.0.1 fmskyspark` when both run on the same machine).

Other connectors that point at the same server with a different host will keep failing with this error. Fix their `uri` the same way, or delete them so they stop retrying.

---

## Fix B: `BadSecurityChecksFailed` (step 2, secure channel)

**Trace looks like:**

```
opc::OpcErr: Status Code [0x80ae0000] The network connection has been closed.
  opc::TcpSecureChannel.open (TcpSecureChannel.fan:48)
Cause:
  opc::OpcErr: Status Code [0x80130000] An error occurred verifying security.
    opc::TcpConnReader.receive (TcpConn.fan:128)
```

**Meaning:** the network is fine. The OPC server got the SkySpark certificate and rejected it. `lastOk: never` confirms that the connector never got past the handshake.

**Causes, most likely first:**

1. The server does not trust the SkySpark cert yet.
2. The cert has expired.
3. The clocks on the two machines are far apart.
4. The `uri` hostname does not match the server cert.

**Fix:**

1. Run `connPing(@connId)` once. The server now saves the SkySpark cert in its **Rejected** folder.
2. On the OPC server PC, move the cert from `rejected\certs` to `trusted\certs`. Its subject includes the SkySpark hostname.
3. Restart the OPC server service.
4. Run `connPing(@connId)` again.

### Matrikon cert folders

Matrikon UA products keep each new client cert in a **Rejected** folder until someone moves it to **Trusted**.

- **UA Explorer** (from the Vester support article):
  ```
  C:\Users\<user>\AppData\Local\Matrikon\OPCUAExplorer\pki\DefaultApplicationGroup\rejected\certs
  C:\Users\<user>\AppData\Local\Matrikon\OPCUAExplorer\pki\DefaultApplicationGroup\trusted\certs
  ```
- **UA Tunneller / UA Wrapper / Data Broker:** not confirmed. Look for a matching `pki\...\rejected\certs` folder under `C:\ProgramData\Matrikon\` or under the service account's `AppData\Local\Matrikon\`. On the server PC, search for folders named `rejected`.

Trust must go both ways. In most setups the server sends its cert during the handshake and SkySpark accepts it. If a new error says that the **server** cert is not trusted, add it to the SkySpark crypto store.

### Make a new client cert (if it expired or you need a new one)

```axon
// replace the default cert (alias opc.default)
opcGenCert("dc=alabirmingham, cn=SkySparkOpcClient")

// or make a cert with its own alias, then point the connector at it
opcGenCert("dc=alabirmingham, cn=SkySparkOpcClient2", "opc.custom")
commit(diff(readById(@connId), {opcCertAlias: "opc.custom"}))
```

After you make a new cert, trust it again on the server (go back to step 1 of this fix).

---

## Fix C: `UnsupportedErr` in `AsymNone.encrypt` (step 4, login)

**Trace looks like:**

```
sys::UnsupportedErr
  opc::AsymNone.encrypt (None.fan:20)
  opc::Session.toIdentityToken (Session.fan:220)
  opc::UserNameIdentityToken.make (UserNameIdentityToken.fan:21)
  opc::Session.onActivate (Session.fan:194)
```

**Meaning:** good news first. The endpoint matched, the cert is trusted and the session opened. The failure is at login, and it happens inside SkySpark: the password never reaches the OPC server, so the server's user list is never checked.

SkySpark has to encrypt the password before it sends it. It picks the encryption from the `SecurityPolicyUri` of the server's `UserName` token policy. There are two ways it ends up with `AsymNone`, which cannot encrypt:

1. **`opcSecurity` is `None`.** There is no policy to encrypt with. Fix: set a real policy (see below).
2. **The server sends `SecurityPolicyUri: null` for the UserName token.** Check the endpoint list (from a `No matching endpoint` error or a trace):
   ```
   UserTokenPolicy [
     PolicyId: 0
     TokenType: UserName
     SecurityPolicyUri: null     <-- this
   ]
   ```
   Under the OPC UA spec, `null` means "use the endpoint's policy". SkySpark 3.1.9 appears to read it as `None` instead. **Matrikon UA Wrapper does this**, and its config UI has only on/off checkboxes for token types, so you cannot change it. In this case no `opcSecurity` value fixes UserName login.

   This is inferred from the stack trace and the endpoint dump. The hxOpc source for `Session.toIdentityToken` is not indexed in fantom-mcp, so it is not confirmed in code.

**Fix 1 (recommended for Matrikon UA Wrapper): Anonymous login over an encrypted channel**

In the real case below, the connector opened (`status: ok`, `lastOk` set) after this change was recommended. Confirm on your own server.

```axon
commit(diff(readById(@connId), {
  opcSecurity: "Basic256Sha256 SignAndEncrypt",
  opcCertAlias: "opc.default",
  opcUserAuthMode: "Anonymous",
  username: removeMarker()
}))
connPing(@connId)
```

This is not the same as "no security":

- The channel is still signed and encrypted.
- The server accepts only clients whose cert is in its Trusted folder (Fix B), so the cert controls who can connect.
- Afterwards, uncheck **None** under Security Mode & Policies on the server, so no client can connect without encryption.
- Check that the anonymous user can browse and read the items you need.

**Fix 2: Certificate login**, if the server offers `TokenType: Certificate` and your SkySpark version lets you pick it in `opcUserAuthMode`. The client cert is already trusted, so no password is needed.

**Fix 3: UserName login (when the server sends a real token policy)**

```axon
commit(diff(readById(@connId), {
  opcSecurity: "Basic256Sha256 SignAndEncrypt",
  opcCertAlias: "opc.default",
  opcUserAuthMode: "UserName",
  username: "<opc user>"
}))
passwordSet(@connId, "<opc password>")
connPing(@connId)
```

If you need UserName login on a server that sends `SecurityPolicyUri: null`, open a SkyFoundry support ticket ("UserTokenPolicy with null SecurityPolicyUri falls back to AsymNone") with the stack trace and endpoint dump, and check whether a release after 3.1.9 fixes it.

---

## Fix D: Other errors

| Error | Meaning | Fix |
| --- | --- | --- |
| `BadSecurityPolicyRejected` | The server does not offer this `opcSecurity`. | Pick a policy the server offers, or turn it on in the server. |
| `BadIdentityTokenRejected` | The server does not accept this login type. | Turn on UserName (or Anonymous) login on the server endpoint. |
| `BadUserAccessDenied` | Wrong user or password, or the user has no access. | Check the user on the server. Run `passwordSet` again. |
| `BadCertificateTimeInvalid` | A cert has expired or is not valid yet. | Check both clocks. Make a new cert with `opcGenCert`. |
| `BadCertificateUriInvalid` / `BadCertificateHostNameInvalid` | The cert URI or hostname does not match. | Use the hostname from the server cert in `uri`. Do not use the IP if the cert has a name. |
| `java.security.InvalidKeyException: Illegal key size` | Old Java without strong crypto. | Update Java, or install the JCE Unlimited Strength files. Restart SkySpark. |
| `ConnectException` / timeout on open | Network or firewall. | Check the port (often 4840, or 21381 for the Matrikon UA Wrapper) from the SkySpark host. |

---

## Fix E: `BrowseRequest` timeout while learning

**Trace looks like** (shown in a dialog when you expand a folder in the connector tree):

```
opc::OpcErr: [opc::BrowseRequest, 11, 12sec, 12sec, TIMEOUT, pending] [0x800a0000] The operation timed out.
  navMod::ConnLearnPlan.doExecute ...
```

**Meaning:** the connector is fine (`connStatus: ok`, `connState: open`). Only one browse failed. SkySpark asked "what is inside this folder?" and the server did not answer in about 12 seconds. `0x800a0000` is `BadTimeout`. `ConnLearnPlan` means it came from expanding the tree (learn), not from polling.

**Why it happens with Matrikon:** a browse of a remote DA server goes through many hops:

```
SkySpark -> UA Wrapper -> Classic Tunneller -> network -> remote PC -> DA server (e.g. ArchestrA FSGateway) -> back
```

Classic DA browsing is slow, and a big folder can take longer than 12 seconds. The first browse is the slowest.

**Fix, in order:**

1. Close the dialog and expand the same folder again. The Wrapper and Tunneller often cache the first result, so the second try often works.
2. Browse in small steps. Open one subfolder at a time and wait for each one.
3. If every expand under one source times out, check the Tunneller's **Classic Client to Classic Server** tab. The connection to that remote PC must show as connected and not keep reconnecting.
4. Skip browsing. You do not need the tree to make points. If you know the item address (from the source system, or from a folder that does open), create the point with `opcCur` / `opcHis` set to its NodeId (Step 5, option 2). Polling a known NodeId does not use `BrowseRequest`.

The 12-second limit does not match the connector `timeout` (1min), so raising `timeout` may not help. Which setting controls it is not confirmed.

---

## Step 3: Trace the Messages (if the fix is not clear)

```axon
connTraceEnable(@connId)
connPing(@connId)
```

Wait a few seconds, then:

```axon
connTrace(@connId).sortr("ts").keepCols(["ts", "type", "msg"])
```

When you are done:

```axon
connTraceDisable(@connId)
```

## Step 4: Confirm the Connector Works

```axon
do
  r: readById(@connId)
  {connStatus: r["connStatus"], connState: r["connState"], connErr: r["connErr"]}
end
```

Expect `connStatus: "ok"` and `connState: "open"`. In `connDetails`, `lastOk` must show a time, not `never`.

## Step 5: Add Points

### Matrikon UA Wrapper: expose the real servers first

If the tree shows only `Server` and `Matrikon.OPC.Simulation` (Simulation Items, Configured Aliases, `@ClientCount`, ...), the Wrapper is exposing only Matrikon's built-in test server. Simulation tags are fine for a test (bind `Simulation Items -> Random -> Real8` and watch `curVal` change), but they are not building data.

To expose the real DA servers:

1. In the Matrikon Tunneller / Wrapper config, open **UA Client to Classic Server** and click **+**.
2. Expand **Discover Classic Server**. Host: `localhost`. Server Type: **DA**.
3. Pick the server from the discovered list. Remote servers reached through the Classic Tunneller show as `Tunneller:<host>:<ProgID>`, for example:
   - `Tunneller:fmicecams:WINCC_OA.OPC.1` (Siemens WinCC OA)
   - `Tunneller:fmmicromoda:ArchestrA.FSGateway.3` (AVEVA / Wonderware)
4. Check **Classic (COM) Details**: Server Type DA, Host `localhost`, ProgID and ClassID filled in. Leave the other fields at their defaults (Reconnect Time 100, DA Version 2.XX, Linked HDA None). Click **Add**. Repeat for each source.
5. **Restart the Wrapper** (↻ next to Status: Running). It reads the server list only at start.
6. In SkySpark, **Close** then **Ping** the connector, and re-expand it in the tree. Each added server shows up as a new top-level folder.

If the remote servers are missing from the discover list, or their folders are empty, check the **Classic Client to Classic Server** tab: the Tunneller link to that remote PC must be connected.

One Wrapper can serve all the remote systems behind the Tunneller, so one SkySpark connector (`opc.tcp://<wrapper host>:21381/MatrikonOpcUaWrapper`) can reach them all. If other connectors point at this same Wrapper with a different host, give them the same `uri` and settings. Delete the ones you no longer need so they stop retrying.

### Browse and bind

1. Browse the server with learn. Start at the root:
   ```axon
   connLearn(@connId, null)
   ```
   Pass a `learn` value from a row to go one level down. The Connector app does the same thing with a UI and is the easiest way to add points. If a folder times out, see Fix E.
2. Or add a point by hand:
   ```axon
   commit(diff(null, {
     point, opcPoint, cur, his,
     dis: "AHU-1 Supply Temp",
     opcConnRef: @connId,
     opcCur: "ns=2;s=AHU1.SupplyTemp",
     kind: "Number",
     unit: "°F",
     tz: "Chicago",
     siteRef: @siteId, equipRef: @equipId
   }, {add}))
   ```
3. Sync it once:
   ```axon
   readAll(opcPoint and opcConnRef==@connId).connSyncCur
   ```

## Checklist

- [ ] `uri` uses `opc.tcp://` and points at the UA endpoint (Tunneller or Wrapper for Matrikon DA servers).
- [ ] `uri` host matches the server's reported `EndpointUrl` exactly (not `localhost` or an IP).
- [ ] `opcSecurity` matches a policy/mode pair in the server's endpoint list.
- [ ] `opcCertAlias` is set and the cert has not expired.
- [ ] The SkySpark cert is in the server's **Trusted** folder.
- [ ] `UserName` login: policy is not `None` and the server's UserName token has a non-null `SecurityPolicyUri`. Otherwise use Anonymous over `SignAndEncrypt`.
- [ ] Password set with `passwordSet`, not as a record tag.
- [ ] Clocks on both machines match (NTP).
- [ ] `connStatus: ok`, `lastOk` is not `never`.
- [ ] Matrikon Wrapper exposes the real DA servers, not only `Matrikon.OPC.Simulation`, and was restarted after adding them.

## Sources

- SkySpark 3.1.11 `lib-opc` docs: Endpoint Connectivity, Security Policy, Certificates, NodeIds, `opcConn`, `opcSecurity`, `opcUserAuthMode`, `opcGenCert`.
- SkySpark 3.1.11 `lib-conn` docs: `connPing`, `connDetails`, `connLearn`, `connTrace*`.
- Haxall 4.0.4 `hxConn::ConnFwFuncs` (via fantom-mcp).
- [Managing Matrikon UA Explorer Certificates (Vester)](https://vesterbusiness.freshdesk.com/support/solutions/articles/44002415686-managing-matrikon-ua-explorer-certificates)
- [Step-by-Step Guide to Configuring Tunneller UA Proxy (Vester)](https://vesterbusiness.freshdesk.com/support/solutions/articles/44002621289-step-by-step-guide-to-configuring-tunneller-ua-proxy)
- Real case: `alabirmingham` project, "Opc Conn Copy", SkySpark 3.1.9 on Windows Server 2022, MatrikonOPC UA Wrapper on `fmskyspark:21381` with the Classic Tunneller to `fmicecams` and `fmmicromoda`. Errors in order: Fix B (cert trust), Fix C (`UnsupportedErr`), Fix A (`localhost` URI), Fix C again (Matrikon `null` token policy; the connector opened after the switch to Anonymous over SignAndEncrypt), then Fix E (browse timeout under the `fmmicromoda` ArchestrA source, most likely on expanding the EMS folder).
