--!nocheck
-- Apple Hub core: session card, 30 minute revalidation, and game module loading.
local Hub = {}

local HttpService = game:GetService("HttpService")

local httpRequest = (syn and syn.request) or (http and http.request) or http_request or request

local function httpCall(method, url, body)
	if httpRequest then
		local requestOk, response = pcall(httpRequest, {
			Url = url,
			Method = method,
			Headers = body and { ["Content-Type"] = "application/json" } or {},
			Body = body,
		})
		if requestOk and type(response) == "table" then
			return response.Body
		end
		return nil
	end
	if method == "GET" then
		local getOk, response = pcall(function()
			return game:HttpGet(url, true)
		end)
		if getOk then
			return response
		end
	end
	return nil
end

local function decode(raw)
	if type(raw) ~= "string" then
		return nil
	end
	local decodeOk, value = pcall(HttpService.JSONDecode, HttpService, raw)
	if decodeOk and type(value) == "table" then
		return value
	end
	return nil
end

local function sessionText(session)
	local expiry = "selamanya"
	if session.expiresAt then
		expiry = os.date("!%Y-%m-%d %H:%M UTC", math.floor(session.expiresAt / 1000))
	end
	return table.concat({
		"Tier: " .. tostring(session.tier),
		"Key: " .. tostring(session.keyPrefix),
		"Perangkat: " .. tostring(session.edge.used) .. "/" .. tostring(session.edge.max),
		"Berlaku sampai: " .. expiry,
	}, "  •  ")
end

function Hub.start(opts)
	local window = opts.window
	local windui = opts.windui
	local base = opts.base
	local session = opts.session
	local device = opts.device

	local alive = true

	local function notify(title, content)
		pcall(function()
			windui:Notify({ Title = title, Content = content, Duration = 6 })
		end)
	end

	local function setStatus(paragraph)
		pcall(function()
			paragraph:SetDesc(sessionText(session))
		end)
	end

	local function revalidate()
		if not session.key then
			return nil
		end
		local raw = httpCall(
			"POST",
			base .. "/v1/validate",
			HttpService:JSONEncode({
				key = session.key,
				hwid = device,
				user_id = tostring(game:GetService("Players").LocalPlayer.UserId),
			})
		)
		return decode(raw)
	end

	local home = window:Tab({ Title = "Home", Icon = "house" })
	local status = home:Paragraph({
		Title = "Apple Hub",
		Desc = sessionText(session),
		Buttons = {
			{
				Title = "Discord",
				Icon = "message-circle",
				Callback = function()
					if setclipboard then
						pcall(setclipboard, opts.discord)
					end
					notify("Discord", "Link Discord disalin ke clipboard.")
				end,
			},
			{
				Title = "Cek key",
				Icon = "refresh-cw",
				Callback = function()
					local result = revalidate()
					if not result then
						notify("Cek key", "Server tidak bisa dihubungi. Coba lagi nanti.")
					elseif result.ok == true then
						session.tier = result.tier
						session.edge = result.edge
						setStatus(status)
						notify("Cek key", "Key masih valid.")
					else
						notify("Cek key", result.message or "Key tidak valid.")
					end
				end,
			},
		},
	})

	local function clearWindowMarker()
		local genv = getgenv or function()
			return _G
		end
		pcall(function()
			genv().__applehub_windui = nil
		end)
	end

	local function stopHub(message)
		if not alive then
			return
		end
		alive = false
		notify("Apple Hub", message or "Key tidak lagi valid. Hub dihentikan.")
		task.wait(5)
		pcall(function()
			windui.ScreenGui:Destroy()
		end)
		clearWindowMarker()
	end

	task.spawn(function()
		while alive do
			task.wait(1800)
			if not alive then
				break
			end

			local result = revalidate()
			if result == nil then
				continue
			end

			if result.ok == true then
				session.tier = result.tier
				session.edge = result.edge
				setStatus(status)
			elseif
				result.reason == "revoked"
				or result.reason == "expired"
				or result.reason == "unknown"
				or result.reason == "edge_limit"
			then
				stopHub(result.message)
				break
			end
		end
	end)

	local manifest = decode(httpCall("GET", base .. "/v1/manifest"))
	if not manifest or type(manifest.games) ~= "table" then
		home:Paragraph({
			Title = "Gagal memuat daftar game",
			Desc = "Server tidak bisa dihubungi. Tutup Hub lalu jalankan ulang loader.",
		})
		return Hub
	end

	local universeId = tostring(game.GameId)
	local entry = nil
	for _, candidate in ipairs(manifest.games) do
		if candidate.enabled ~= false and tostring(candidate.universe_id) == universeId then
			entry = candidate
			break
		end
	end

	if not entry then
		home:Paragraph({
			Title = "Game belum didukung",
			Desc = "Apple Hub belum punya fitur untuk game ini. Universe ID: " .. universeId,
		})
		return Hub
	end

	if entry.min_tier == "premium" and session.tier ~= "premium" then
		home:Paragraph({
			Title = entry.name .. " (Premium)",
			Desc = "Fitur ini butuh key Premium. Hubungi admin di Discord.",
		})
		return Hub
	end

	local source = httpCall("GET", base .. entry.path)
	if not source then
		notify("Apple Hub", "Gagal mengunduh modul " .. tostring(entry.name) .. ".")
		return Hub
	end

	local factory, loadError = loadstring(source, "@applehub/module/" .. tostring(entry.module))
	if not factory then
		notify("Apple Hub", "Modul rusak: " .. tostring(loadError))
		return Hub
	end

	local moduleOk, module = pcall(factory)
	if not moduleOk or type(module) ~= "table" or type(module.init) ~= "function" then
		notify("Apple Hub", "Modul " .. tostring(entry.name) .. " tidak valid.")
		return Hub
	end

	local ctx = {
		window = window,
		windui = windui,
		state = {},
		tier = session.tier,
		alive = function()
			return alive
		end,
		notify = notify,
		log = function(...)
			print("[Apple Hub]", ...)
		end,
	}

	local initOk, initError = pcall(module.init, ctx)
	if not initOk then
		notify("Apple Hub", "Modul " .. tostring(entry.name) .. " error: " .. tostring(initError))
	end

	return Hub
end

return Hub
