--!nocheck
-- Assasin Leveling (universe 10767824942).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer

local ZONES = {
	{ id = "x1.5", label = "x1.5", position = Vector3.new(-52, 8, -201) },
	{ id = "x3", label = "x3", position = Vector3.new(-51, 8, -217) },
	{ id = "x5", label = "x5", position = Vector3.new(-23, 8, -217) },
}

local function humanoidRootPart()
	local character = player.Character
	if not character then
		return nil
	end
	return character:FindFirstChild("HumanoidRootPart")
end

local function zoneById(id)
	for _, zone in ipairs(ZONES) do
		if zone.id == id then
			return zone
		end
	end
	return nil
end

return {
	init = function(ctx)
		local tab = ctx.window:Tab({ Title = "Assasin Leveling", Icon = "swords" })
		local zoneId = ctx.state.zone or "x1.5"
		local clicking = false

		local function teleport(id)
			local zone = zoneById(id)
			if not zone then
				ctx.notify("Teleport", "Zona tidak dikenal.")
				return
			end

			local root = humanoidRootPart()
			if not root then
				ctx.notify("Teleport", "Karakter belum siap. Tunggu respawn lalu coba lagi.")
				return
			end

			root.CFrame = CFrame.new(zone.position)
			ctx.notify("Teleport", "Pindah ke zona " .. zone.label .. ".")
		end

		local toggle

		toggle = tab:Toggle({
			Title = "Auto Click",
			Desc = "Menekan Remotes.Click terus-menerus.",
			Value = false,
			Callback = function(state)
				ctx.state.autoClick = state
				if not state then
					clicking = false
					return
				end
				if clicking then
					return
				end

				clicking = true
				task.spawn(function()
					while clicking and ctx.alive() do
						local remotes = ReplicatedStorage:FindFirstChild("Remotes")
						local remote = remotes and remotes:FindFirstChild("Click")
						if remote then
							remote:FireServer()
						end
						task.wait()
					end
					clicking = false
				end)
			end,
		})

		tab:Dropdown({
			Title = "Teleport Zone",
			Desc = "Pilih zona farm.",
			Values = { "x1.5", "x3", "x5" },
			Value = zoneId,
			Callback = function(selected)
				zoneId = selected
				ctx.state.zone = selected
			end,
		})

		tab:Button({
			Title = "Teleport",
			Desc = "Pindah ke zona yang dipilih.",
			Callback = function()
				teleport(zoneId)
			end,
		})

		-- Stop the click loop when the hub shuts down.
		task.spawn(function()
			while ctx.alive() do
				task.wait(1)
			end
			clicking = false
			pcall(function()
				toggle:Set(false)
			end)
		end)
	end,
}
