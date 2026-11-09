--!nocheck
-- Apple Hub loader. Served from /loader; BASE is injected from the request origin.
local BASE = "__APPLEHUB_BASE__"
local DISCORD_INVITE = "https://discord.gg/applehub"

local genv = getgenv or function()
	return _G
end
local env = genv()
-- `warn` exists in Roblox but not in the standalone Luau CLI, which we use to
-- syntax-check this file.
local logWarn = warn or print

local function setWindowMarker(value)
	pcall(function()
		env.__applehub_windui = value
	end)
end

-- A previous run may still own a window (for example when the key prompt was
-- closed without submitting). Tear it down so the loader is always re-runnable.
if env.__applehub_windui then
	pcall(function()
		env.__applehub_windui.ScreenGui:Destroy()
	end)
	setWindowMarker(nil)
end

local ok, err = pcall(function()
	local Players = game:GetService("Players")
	local HttpService = game:GetService("HttpService")
	local player = Players.LocalPlayer

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

	-- gethwid() is also what WindUI uses to name the saved key file, so the
	-- server and the client agree on the device identity.
	local function deviceId()
		local hwidOk, hwid = pcall(function()
			return gethwid()
		end)
		if hwidOk and type(hwid) == "string" and #hwid > 0 then
			return hwid
		end

		local hasFilesystem = isfile and readfile and writefile and makefolder
		local path = "AppleHub/device.txt"
		if hasFilesystem then
			if not isfolder("AppleHub") then
				pcall(makefolder, "AppleHub")
			end
			if isfile(path) then
				local saved = readfile(path)
				if type(saved) == "string" and #saved > 0 then
					return saved
				end
			end
		end

		local generated = HttpService:GenerateGUID(false)
		if hasFilesystem then
			pcall(writefile, path, generated)
		end
		return generated
	end

	local device = deviceId()
	local session = nil

	local function validate(key)
		local raw = httpCall(
			"POST",
			BASE .. "/v1/validate",
			HttpService:JSONEncode({
				key = key,
				hwid = device,
				user_id = tostring(player.UserId),
				place_id = tostring(game.PlaceId),
			})
		)
		if not raw then
			return false, "Tidak bisa menghubungi server Apple Hub. Periksa koneksi lalu coba lagi."
		end

		local payload = decode(raw)
		if not payload then
			return false, "Respons server tidak valid."
		end

		if payload.ok == true then
			session = payload
			session.key = key
			session.device = device
			return true, "Key valid."
		end

		if payload.reason == "rate_limited" and payload.retry_after then
			return false, "Terlalu banyak percobaan. Coba lagi dalam " .. tostring(payload.retry_after) .. " detik."
		end

		return false, payload.message or "Key tidak valid."
	end

	local winduiSource = httpCall("GET", BASE .. "/vendor/windui.lua")
	if not winduiSource then
		error("Gagal mengunduh UI. Periksa koneksi internet.", 0)
	end

	local winduiFactory, winduiError = loadstring(winduiSource, "@applehub/windui")
	if not winduiFactory then
		error("UI rusak: " .. tostring(winduiError), 0)
	end

	local winduiOk, WindUI = pcall(winduiFactory)
	if not winduiOk or type(WindUI) ~= "table" then
		error("UI gagal dimuat: " .. tostring(WindUI), 0)
	end
	setWindowMarker(WindUI)

	WindUI.Services = WindUI.Services or {}
	WindUI.Services.applehub = {
		Name = "Apple Hub",
		Icon = "apple",
		Args = {},
		New = function()
			return {
				Verify = function(key)
					local verifyOk, valid, message = pcall(validate, key)
					if not verifyOk then
						return false, "Verifikasi gagal: " .. tostring(valid)
					end
					return valid, message
				end,
				Copy = function()
					if setclipboard then
						pcall(setclipboard, DISCORD_INVITE)
					end
					return DISCORD_INVITE
				end,
			}
		end,
	}

	local window = WindUI:CreateWindow({
		Title = "Apple Hub",
		Icon = "apple",
		Author = "Cranch",
		Folder = "AppleHub",
		KeySystem = {
			Note = "Masukkan key Apple Hub. Belum punya? Klik Get key lalu ambil key gratis di Discord.",
			SaveKey = isfile ~= nil and writefile ~= nil,
			URL = DISCORD_INVITE,
			API = {
				{
					Type = "applehub",
					Title = "Apple Hub",
					Desc = "Key dari Discord Apple Hub.",
				},
			},
		},
	})

	if not window then
		error("Window gagal dibuat.", 0)
	end

	if not session then
		error("Sesi key tidak terbentuk.", 0)
	end

	local coreSource = httpCall("GET", BASE .. "/v1/hub")
	if not coreSource then
		error("Gagal mengunduh Apple Hub. Coba lagi.", 0)
	end

	local coreFactory, coreError = loadstring(coreSource, "@applehub/core")
	if not coreFactory then
		error("Hub rusak: " .. tostring(coreError), 0)
	end

	local coreOk, hub = pcall(coreFactory)
	if not coreOk or type(hub) ~= "table" or type(hub.start) ~= "function" then
		error("Hub gagal dimuat: " .. tostring(hub), 0)
	end

	local startOk, startError = pcall(hub.start, {
		window = window,
		windui = WindUI,
		base = BASE,
		session = session,
		device = device,
		discord = DISCORD_INVITE,
	})
	if not startOk then
		error("Hub gagal dijalankan: " .. tostring(startError), 0)
	end
end)

if not ok then
	setWindowMarker(nil)
	logWarn("[Apple Hub] " .. tostring(err))
end
