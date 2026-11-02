
export class LobbyView {
  constructor(lobby, elements) {
    this.lobby = lobby;
    this.elements = elements;

    lobby.addEventListener("roomsChanged", (event) => {
      this.renderRooms(event.detail);
    });

    lobby.addEventListener("error", (event) => {
      elements.status.textContent = event.detail.message;
    });
  }

  renderRooms(rooms) {
    const { roomList } = this.elements;
    roomList.replaceChildren();

    for (const room of rooms) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "room-option";
      button.textContent =
        `${room.name} — ${room.players}/${room.maxPlayers} гравців`;

      button.disabled = room.players >= room.maxPlayers;

      button.addEventListener("click", () => {
        this.elements.roomId.value = room.id;

        for (const item of roomList.children) {
          item.classList.remove("selected");
        }

        button.classList.add("selected");
      });

      roomList.append(button);
    }

    this.elements.status.textContent =
      `Знайдено кімнат: ${rooms.length}`;
  }
}
