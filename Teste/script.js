// ==============================
// ELEMENTOS
// ==============================

const modal = document.getElementById("modal");

const fecharModal = document.getElementById("fecharModal");

const cancelar = document.querySelector(".cancelar");

const salvar = document.querySelector(".salvar");

const titulo = document.getElementById("tituloConfronto");

const mesa = document.getElementById("mesa");

const horario = document.getElementById("horario");


// ==============================
// TODOS OS BOTÕES
// ==============================

const botoes = document.querySelectorAll(".abrirModal");


// ==============================
// ABRIR MODAL
// ==============================

botoes.forEach(botao => {

    botao.addEventListener("click", () => {

        const jogador1 = botao.dataset.j1;
        const jogador2 = botao.dataset.j2;
        const numeroMesa = botao.dataset.mesa;
        const hora = botao.dataset.hora;

        titulo.textContent = `${jogador1} × ${jogador2}`;

        mesa.textContent = numeroMesa;
        horario.textContent = hora;

        // Atualiza os nomes dos jogadores
        for(let i = 1; i <= 5; i++){

            document.getElementById(`nomeJ1Set${i}`).textContent = jogador1;
            document.getElementById(`nomeJ2Set${i}`).textContent = jogador2;

        }

        limparCampos();

        modal.style.display = "flex";

    });

});


// ==============================
// FECHAR MODAL
// ==============================

function fechar(){

    modal.style.display = "none";

}

fecharModal.addEventListener("click", fechar);

cancelar.addEventListener("click", fechar);


// ==============================
// CLICOU FORA DO MODAL
// ==============================

modal.addEventListener("click", (e)=>{

    if(e.target === modal){

        fechar();

    }

});


// ==============================
// TECLA ESC
// ==============================

document.addEventListener("keydown",(e)=>{

    if(e.key === "Escape"){

        fechar();

    }

});


// ==============================
// LIMPAR CAMPOS
// ==============================

function limparCampos(){

    const inputs = document.querySelectorAll("input[type='number']");

    inputs.forEach(input=>{

        input.value = "";

    });

    document.querySelector("textarea").value = "";

}


// ==============================
// BOTÃO SALVAR
// ==============================

salvar.addEventListener("click",()=>{

    const sets = [];

    const inputs = document.querySelectorAll(".set");

    inputs.forEach((set,index)=>{

        const numeros = set.querySelectorAll("input");

        sets.push({

            set:index+1,

            jogador1:numeros[0].value,

            jogador2:numeros[1].value

        });

    });

    const observacao = document.querySelector("textarea").value;

    console.clear();

    console.log("===== DADOS DA PARTIDA =====");

    console.log("Confronto:",titulo.textContent);

    console.log("Mesa:",mesa.textContent);

    console.log("Horário:",horario.textContent);

    console.table(sets);

    console.log("Observações:",observacao);

    alert(
`Protótipo!

Nenhum dado foi salvo.

Abra o Console (F12) para visualizar os dados capturados.`
    );

    fechar();

});


// ==============================
// MELHORIA VISUAL
// ENTER VAI PARA O PRÓXIMO CAMPO
// ==============================

const numeros = document.querySelectorAll("input[type='number']");

numeros.forEach((input,index)=>{

    input.addEventListener("keydown",(e)=>{

        if(e.key === "Enter"){

            e.preventDefault();

            if(index + 1 < numeros.length){

                numeros[index+1].focus();

            }

        }

    });

});


// ==============================
// APENAS NÚMEROS POSITIVOS
// ==============================

numeros.forEach(input=>{

    input.addEventListener("input",()=>{

        if(input.value < 0){

            input.value = 0;

        }

    });

});