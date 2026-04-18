# Tentacles

Динамические модели для effector

## Создание

Новый контракт:
```ts
const myContract = createContract((builder) => ({
    a: builder.state().value<number>(),
    b: builder.state().generic<"T">(),
    c: builder.event().value<number>()
}))
```

Новая модель:
```ts
const model = myContract.createModel<{ T: boolean }>((contract) => {
    sample({ clock: contract.a, fn: () => true, target: contract.b })

    return contract
})
```

```ts
const todoModalViewModel = createViewModel(contract, (model, { props, ctx, children, mounted, unmounted }) => {
  

  return { ...model }
})
```