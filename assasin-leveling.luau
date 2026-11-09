local WindUI = loadstring(game:HttpGet("https://github.com/Footagesus/WindUI/releases/download/1.6.66/main.lua"))()

local currentGame = game.GameId

local ASSASIN_LEVELING_UNIVERSE_ID = 10767824942

if currentGame == ASSASIN_LEVELING_UNIVERSE_ID then
    getgenv().AutoClick = false
    getgenv().SelectedZoneTeleport = "x1.5"
    getgenv().HalfZonePosition= CFrame.new(-52, 8, -201)
    getgenv().ThreeZonePosition= CFrame.new(-51, 8, -217)
    getgenv().FiveZonePosition = CFrame.new(-23, 8, -217)

    local function autoClick()
        while AutoClick do
                game:GetService("ReplicatedStorage").Remotes.Click:FireServer()
                task.wait()
        end
    end

    local function teleportToLocation(location: string)
        if location == "x1.5" then
            game.Players.LocalPlayer.Character:FindFirstChild("HumanoidRootPart").CFrame = getgenv().HalfZonePosition
        elseif location == "x3" then
            game.Players.LocalPlayer.Character:FindFirstChild("HumanoidRootPart").CFrame = getgenv().ThreeZonePosition
        elseif location == "x5" then
            game.Players.LocalPlayer.Character:FindFirstChild("HumanoidRootPart").CFrame = getgenv().FiveZonePosition
        end
    end

    local window = WindUI:CreateWindow({
        Title = "Apple Hub",
        Icon = "Apple",
        Author = "Cranch"
    })

    local HomeTab = window:Tab({
        Title = "Home",
        Icon = "house"
    })

    HomeTab:Toggle({
            Title = "Auto Click",
            Callback = function(state)
                getgenv().AutoClick = state
                autoClick()
            end
    })

    HomeTab:Dropdown({
        Title = "Teleport Zone",
           Values = {
               "x1.5",
               "x3",
               "x5",
           },
           Callback = function(selected)
              getgenv().SelectedTeleport = selected
           end
    })
    HomeTab:Button({
        Title = "Teleport",
        Callback = function()
            teleportToLocation(getgenv().SelectedTeleport)
        end
    })
end
